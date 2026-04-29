import express from 'express';
const router = express.Router();
import { getOrganizations, createOrganization, updateOrganization, deleteOrganization } from '../controllers/organizationController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

router.route('/')
  .get(protect, getOrganizations)
  .post(protect, authorize('SUPER_ADMIN'), createOrganization);

router.route('/:id')
  .put(protect, authorize('SUPER_ADMIN'), updateOrganization)
  .delete(protect, authorize('SUPER_ADMIN'), deleteOrganization);

export default router;
