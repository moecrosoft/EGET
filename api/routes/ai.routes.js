const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

// Text generation & completion
router.post('/generate-text', aiController.generateText);

// Image generation
router.post('/generate-image', aiController.generateImage);

// Embeddings / Vector processing
router.post('/embeddings', aiController.createEmbeddings);

// Chat / Stream completion
router.post('/chat', aiController.streamChat);

module.exports = router;