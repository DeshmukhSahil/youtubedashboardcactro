const API = '/api';

function $(sel) { return document.querySelector(sel); }
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

function showActivity(text) {
  const act = $('#activity');
  act.textContent = text;
  setTimeout(() => { if (act.textContent === text) act.textContent = 'No recent actions'; }, 4000);
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let body = await (contentType.includes('application/json') ? res.json() : res.text());
    const err = new Error('Request failed');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return contentType.includes('application/json') ? res.json() : res.text();
}

async function fetchVideo() {
  try {
    const json = await fetchJSON(API + '/video');
    const item = json.items?.[0] || {};
    const snippet = item.snippet || {};
    const stats = item.statistics || {};

    $('#videoTitle').textContent = snippet.title || 'Untitled';
    $('#videoChannel').textContent = snippet.channelTitle || '';
    $('#videoDesc').textContent = snippet.description || '';
    $('#viewCount').textContent = (stats.viewCount || 0) + ' views';
    $('#videoId').textContent = 'ID: ' + (item.id || '-');

    // thumbnails
    const thumbEl = $('#thumb');
    const tUrl = snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;
    if (tUrl) {
      thumbEl.innerHTML = `<img src="${tUrl}" alt="thumbnail">`;
    } else {
      thumbEl.textContent = 'No thumbnail';
    }

    const isMFK = json.items?.[0]?.status?.madeForKids || json.items?.[0]?.status?.selfDeclaredMadeForKids;
    $('#mfkBadge').textContent = isMFK ? 'Audience: Made for Kids (comments disabled)' : 'Audience: Not marked for kids';
    if (isMFK) $('#mfkBadge').classList.add('muted');

    return item;
  } catch (err) {
    console.error('Failed to fetch video', err);
    $('#videoTitle').textContent = 'Failed to load video';
    $('#videoDesc').textContent = (err.body && err.body.error?.message) || err.message;
    return null;
  }
}

async function loadComments() {
  const container = $('#comments');
  container.innerHTML = 'Loading comments…';
  $('#commentsNotice').style.display = 'none';

  try {
    const json = await fetchJSON(API + '/comments');
    const items = json.items || json; // some APIs return array directly
    if (!items.length) {
      container.innerHTML = '<div class="muted small">No comments found</div>';
      return;
    }

    container.innerHTML = '';
    items.forEach(c => {
      const snippet = c.snippet?.topLevelComment?.snippet || c.snippet || {};
      const author = snippet.authorDisplayName || 'Unknown';
      const text = snippet.textOriginal || snippet.textDisplay || '';
      const published = snippet.publishedAt ? new Date(snippet.publishedAt).toLocaleString() : '';

      const node = el('div', 'comment');
      const meta = el('div', 'meta');
      meta.innerHTML = `<div>${author}</div><div class="muted small">${published}</div>`;
      const textDiv = el('div', 'text');
      textDiv.textContent = text;

      const actions = el('div');
      const delBtn = el('button', 'btn');
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        if (!confirm('Delete this comment?')) return;
        try {
          const id = c.id || snippet.id || (c.snippet?.topLevelComment?.id);
          await fetchJSON(API + '/comment/' + encodeURIComponent(id), { method: 'DELETE' });
          showActivity('Deleted comment');
          // <-- full page refresh after delete (changed)
          location.reload();
        } catch (e) {
          console.error(e);
          alert('Failed to delete: ' + (e.body?.error?.message || e.body || e.message));
        }
      };

      actions.appendChild(delBtn);
      node.appendChild(meta);
      node.appendChild(textDiv);
      node.appendChild(actions);
      container.appendChild(node);
    });
  } catch (err) {
    console.warn('No comments listing endpoint or failed to load comments', err);
    container.innerHTML = '<div class="muted small">Comments listing not available (optional endpoint). You can still post and delete comments if your backend supports those actions.</div>';
    $('#commentsNotice').style.display = 'block';
    $('#commentsNotice').textContent = (err.body && err.body.error?.message) || err.message;
  }
}

async function loadNotes(q = '') {
  try {
    const url = API + '/note/search?q=' + encodeURIComponent(q || '');
    const notes = await fetchJSON(url);
    const list = $('#notesList');
    list.innerHTML = '';
    if (!notes || notes.length === 0) {
      list.innerHTML = '<div class="muted small">No notes</div>';
      return;
    }
    notes.forEach(n => {
      const item = el('div', 'note-item');
      item.innerHTML = `<div>${n.content}</div>`;
      if (n.tags && n.tags.length) {
        const tagsWrap = el('div');
        n.tags.forEach(t => {
          const tEl = el('span', 'tag');
          tEl.textContent = t;
          tagsWrap.appendChild(tEl);
        });
        item.appendChild(tagsWrap);
      }
      list.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load notes', err);
    $('#notesList').innerHTML = '<div class="muted small">Failed to load notes</div>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchVideo();
  await loadComments();
  await loadNotes();

  // comment posting
  $('#commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#commentInput').value.trim();
    if (!text) return;
    try {
      const res = await fetchJSON(API + '/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      showActivity('Comment posted');
      $('#commentInput').value = '';
      //full page refresh after post
      location.reload();
    } catch (err) {
      console.error('Post comment failed', err);
      alert('Post failed: ' + ((err.body && err.body.error?.error?.message) || err.body || err.message));
    }
  });

  // note saving
  $('#noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = $('#noteInput').value.trim();
    const tags = $('#tagInput').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!content) return alert('Please add note text');
    try {
      await fetchJSON(API + '/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, tags })
      });
      showActivity('Note saved');
      $('#noteInput').value = '';
      $('#tagInput').value = '';
      loadNotes();
    } catch (err) {
      console.error('Save note failed', err);
      alert('Save failed: ' + (err.body?.message || err.message));
    }
  });

  // notes search
  $('#searchBtn').addEventListener('click', async () => {
    const q = $('#globalSearch').value.trim();
    await loadNotes(q);
  });
  $('#globalSearch').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = $('#globalSearch').value.trim();
      await loadNotes(q);
    }
  });

  // clear notes
  $('#clearNotes').addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('Clear notes from UI?')) return;
    $('#notesList').innerHTML = '';
    showActivity('Notes cleared (UI only)');
  });
});
