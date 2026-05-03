import express from 'express';
const router = express.Router();
import { 
  authUser, 
  getUserProfile, 
  getUsers, 
  createUser, 
  updateUser, 
  deleteUser,
  getLeadersByOrg,
  getEmployeesByDept,
  changePassword
} from '../controllers/userController.js';
import { getOrganizations } from '../controllers/organizationController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

router.post('/login', authUser);
router.route('/profile').get(protect, getUserProfile);
router.route('/profile/password').put(protect, changePassword);

router.route('/')
  .get(protect, authorize('SUPER_ADMIN', 'LEADER'), getUsers)
  .post(protect, authorize('SUPER_ADMIN', 'LEADER'), createUser);

 
router.get('/leaders/:orgId', protect, getLeadersByOrg);
router.get('/by-dept/:deptId', protect, getEmployeesByDept);

router.route('/:id')
  .put(protect, authorize('SUPER_ADMIN', 'LEADER'), updateUser)
  .delete(protect, authorize('SUPER_ADMIN', 'LEADER'), deleteUser);

export default router;
