import express from 'express';
const router = express.Router();
import { getDepartmentsByOrg, createDepartment, updateDepartment, deleteDepartment } from '../controllers/departmentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

router.route('/').post(protect, authorize('SUPER_ADMIN', 'ADMIN'), createDepartment);
router.route('/org/:orgId').get(protect, getDepartmentsByOrg);
router.route('/:id')
  .put(protect, authorize('SUPER_ADMIN'), updateDepartment)
  .delete(protect, authorize('SUPER_ADMIN'), deleteDepartment);
router.get('/test/:orgId', getDepartmentsByOrg);

export default router;
