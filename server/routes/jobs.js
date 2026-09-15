import express from 'express';
import {
  getJobStatus,
  getJobDomains,
  downloadResult,
  listJobs,
  removeJob
} from '../controllers/jobController.js';

const router = express.Router();

router.get('/', listJobs);
router.get('/:jobId', getJobStatus);
router.get('/:jobId/domains', getJobDomains);
router.get('/:jobId/download', downloadResult);
router.delete('/:jobId', removeJob);

export default router;