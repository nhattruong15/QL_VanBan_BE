import express from 'express';
const router = express.Router();
import {
  createDocument,
  getDocuments,
  updateDocumentStatus,
  getDocumentById,
  getOrgStats,
} from '../controllers/documentController.js';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

router.route('/').post(protect, upload.array('files', 5), createDocument).get(protect, getDocuments);
router.route('/stats/organization').get(protect, getOrgStats);
router.route('/:id').get(protect, getDocumentById);
router.route('/:id/status').put(protect, updateDocumentStatus);

export default router;
