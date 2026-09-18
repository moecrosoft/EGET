const express = require('express');
const router = express.Router();
const aiRoutes = require('./routes/ai.routes');
const errorHandler = require('./middleware/errorHandler');

// Prefix AI endpoints under /ai
router.use('/ai', aiRoutes);

// Register error handling middleware
router.use(errorHandler);

module.exports = router;