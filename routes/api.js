const express = require('express');
const axios = require('axios');
const Note = require('../models/Note');
const Log = require('../models/Log');
const router = express.Router();

const baseURL = 'https://www.googleapis.com/youtube/v3';
const headers = {
  Authorization: `Bearer ${process.env.YOUTUBE_ACCESS_TOKEN}`
};

// Log Helper
async function logAction(action, meta = {}) {
  await Log.create({ action, meta });
}

router.get('/video', async (req, res) => {
  const { VIDEO_ID, YOUTUBE_API_KEY } = process.env;
  try {
    const response = await axios.get(`${baseURL}/videos`, {
      params: {
        part: 'snippet,statistics',
        id: VIDEO_ID,
        key: YOUTUBE_API_KEY
      }
    });
    await logAction('FETCH_VIDEO_DETAILS');
    res.json(response.data);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/comment', async (req, res) => {
  const { text, parentId } = req.body;
  const { VIDEO_ID } = process.env;
  const token = process.env.YOUTUBE_ACCESS_TOKEN;

  if (!token) {
    return res.status(401).json({ error: 'Missing YOUTUBE_ACCESS_TOKEN in env' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Comment text required' });
  }

  try {
    let response;
    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (parentId) {
      response = await axios.post(
        `${baseURL}/comments?part=snippet`,
        { snippet: { parentId, textOriginal: text } },
        config
      );
    } else {
      response = await axios.post(
        `${baseURL}/commentThreads?part=snippet`,
        {
          snippet: {
            videoId: VIDEO_ID,
            topLevelComment: { snippet: { textOriginal: text } }
          }
        },
        config
      );
    }

    await logAction('POST_COMMENT', { text, parentId });
    res.json(response.data);
  } catch (err) {
    console.error('YouTube API error:', err.response?.status, err.response?.data || err.message);
    const status = err.response?.status || 500;
    const data = err.response?.data || { message: err.message };
    res.status(status).json({ error: data });
  }
});

// GET comments
router.get('/comments', async (req, res) => {
  const { VIDEO_ID, YOUTUBE_API_KEY } = process.env;
  const token = process.env.YOUTUBE_ACCESS_TOKEN;
  if (!VIDEO_ID) return res.status(400).json({ error: 'Missing VIDEO_ID in env' });
  const all = req.query.all === 'true';
  const maxResults = Math.min(parseInt(req.query.maxResults || '50', 10), 100); // youtube max per page = 100
  let pageToken = req.query.pageToken;

  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const paramsBase = {
    part: 'snippet,replies',
    videoId: VIDEO_ID,
    maxResults
  };
  if (!token && YOUTUBE_API_KEY) {
    paramsBase.key = YOUTUBE_API_KEY;
  }

  try {
    async function fetchPage(tokenParam) {
      const params = { ...paramsBase };
      if (tokenParam) params.pageToken = tokenParam;
      const resp = await axios.get(`${baseURL}/commentThreads`, { params, headers });
      return resp.data;
    }

    if (!all) {
      const data = await fetchPage(pageToken);
      await logAction('FETCH_COMMENTS_PAGE', { pageToken, count: (data.items || []).length });
      return res.json(data);
    }

    // paginate until no nextPageToken or safety cap reached
    const allItems = [];
    let nextToken = pageToken;
    const SAFETY_LIMIT = 1000; // stop if we collect this many comment threads
    while (true) {
      const data = await fetchPage(nextToken);
      if (Array.isArray(data.items)) allItems.push(...data.items);
      nextToken = data.nextPageToken;
      if (!nextToken) break;
      if (allItems.length >= SAFETY_LIMIT) {
        // stopping early to avoid OOM or excessive requests
        console.warn('comments: reached safety limit while paginating');
        break;
      }
      // small delay for rate limits
    }

    await logAction('FETCH_COMMENTS_ALL', { total: allItems.length });
    return res.json({ items: allItems, nextPageToken: nextToken || null, fetchedAll: !nextToken });
  } catch (err) {
    console.error('YouTube comments.list error:', err.response?.status, err.response?.data || err.message);
    const status = err.response?.status || 500;
    const data = err.response?.data || { message: err.message };
    return res.status(status).json({ error: data });
  }
});



router.delete('/comment/:id', async (req, res) => {
  const token = process.env.YOUTUBE_ACCESS_TOKEN;
  const id = req.params.id;

  if (!token) {
    return res.status(401).json({ error: 'Missing YOUTUBE_ACCESS_TOKEN in env' });
  }
  if (!id) {
    return res.status(400).json({ error: 'Comment id required' });
  }

  const config = {
    params: { id },
    headers: {
      Authorization: `Bearer ${token}`
    }
  };

  try {
    await axios.delete(`${baseURL}/comments`, config);

    await logAction('DELETE_COMMENT', { id });
    return res.sendStatus(200);
  } catch (err) {
    console.error('YouTube delete error:', err.response?.status, err.response?.data || err.message);

    const status = err.response?.status || 500;
    const data = err.response?.data || { message: err.message };
    if (status === 401) {
      return res.status(401).json({ error: 'Unauthorized — token missing/expired/invalid or missing scope', details: data });
    }
    if (status === 403) {
      return res.status(403).json({ error: 'Forbidden — you likely do not have permission to delete this comment (not the comment owner or channel owner)', details: data });
    }
    if (status === 400) {
      try {
        console.log('Attempting fallback: delete as commentThread (thread id)...');
        await axios.delete(`${baseURL}/commentThreads`, config);
        await logAction('DELETE_COMMENTTHREAD', { id });
        return res.sendStatus(200);
      } catch (fallbackErr) {
        console.error('Fallback delete error:', fallbackErr.response?.status, fallbackErr.response?.data || fallbackErr.message);
        return res.status(fallbackErr.response?.status || 500).json({ error: fallbackErr.response?.data || fallbackErr.message });
      }
    }

    return res.status(status).json({ error: data });
  }
});


router.put('/video', async (req, res) => {
  const { title, description } = req.body;
  const { VIDEO_ID } = process.env;

  try {
    const response = await axios.put(`${baseURL}/videos?part=snippet`, {
      id: VIDEO_ID,
      snippet: { title, description }
    }, { headers });

    await logAction('UPDATE_VIDEO_DETAILS', { title, description });
    res.json(response.data);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/note', async (req, res) => {
  const { content, tags } = req.body;
  const { VIDEO_ID } = process.env;

  const note = await Note.create({ videoId: VIDEO_ID, content, tags });
  await logAction('ADD_NOTE', { content, tags });
  res.json(note);
});

router.get('/note/search', async (req, res) => {
  const { q } = req.query;
  const notes = await Note.find({ content: new RegExp(q, 'i') });
  res.json(notes);
});

module.exports = router;
