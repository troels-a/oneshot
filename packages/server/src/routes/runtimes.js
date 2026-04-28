const { Router } = require('express');
const { listRuntimeMetadata } = require('@oneshot/core');

const router = Router();

router.get('/runtimes', async (req, res) => {
  const metadata = listRuntimeMetadata();
  const availability = await req.checkRuntimeAvailability();
  const runtimes = metadata.map(r => ({
    ...r,
    available: availability[r.name]?.available ?? false,
    availabilityReason: availability[r.name]?.reason || null,
  }));
  res.json({ runtimes });
});

module.exports = router;
