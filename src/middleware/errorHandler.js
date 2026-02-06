function errorHandler(err, req, res, next) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);

    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    if (err.code === '23505') {
        return res.status(409).json({ error: 'Duplicate entry' });
    }

    if (err.code === '23503') {
        return res.status(400).json({ error: 'Referenced record not found' });
    }

    res.status(err.statusCode || 500).json({
        error: err.message || 'Internal server error'
    });
}

module.exports = errorHandler;
