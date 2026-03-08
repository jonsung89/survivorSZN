const express = require('express');
const router = express.Router();
const { getAllSports } = require('../sports');

// GET /api/sports - list available sports
router.get('/', (req, res) => {
  try {
    res.json({ success: true, sports: getAllSports() });
  } catch (error) {
    console.error('Error listing sports:', error);
    res.status(500).json({ error: 'Failed to list sports' });
  }
});

module.exports = router;
