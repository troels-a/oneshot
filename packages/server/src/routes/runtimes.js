const { Router } = require('express');
const { listRuntimeMetadata } = require('@oneshot/core');

const router = Router();

router.get('/runtimes', (req, res) => {
  res.json({ runtimes: listRuntimeMetadata() });
});

module.exports = router;
