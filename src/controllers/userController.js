import User from '../models/userModel.js';
import generateToken from '../utils/generateToken.js';

//   (đăng nhập)
// @route   POST /api/users/login
const authUser = async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username })
    .populate('organization')
    .populate('department');

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      leaderLevel: user.leaderLevel,
      organization: user.organization,
      department: user.department,
      token: generateToken(user._id),
    });
  } else {
    res.status(401);
    throw new Error('Invalid username or password');
  }
};

//  (lấy thông tin cá nhân)
// @route   GET /api/users/profile
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('organization')
    .populate('department');

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      leaderLevel: user.leaderLevel,
      organization: user.organization,
      department: user.department,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
};

//  lấy tất cả người dùng
// @route   GET /api/users
const getUsers = async (req, res) => {
  let query = {};
  
  if (req.user.role === 'LEADER' && req.user.leaderLevel === 'ORGANIZATION') {
    query = { organization: req.user.organization };
  } else if (req.user.role !== 'SUPER_ADMIN') {
    res.status(403);
    throw new Error('Không có quyền truy cập danh sách người dùng');
  }

  const users = await User.find(query)
    .populate('organization', 'name')
    .populate('department', 'name');
  res.json(users);
};

//  (tạo người dùng mới)
// @route   POST /api/users
const createUser = async (req, res) => {
  const { name, username, password, role, leaderLevel, organization, department } = req.body;

  const userExists = await User.findOne({ username });

  if (userExists) {
    res.status(400);
    throw new Error('Tên đăng nhập đã tồn tại');
  }

  // Nếu vai trò là ADMIN, buộc cơ quan phải là của họ 
  const userOrg = (req.user.role === 'LEADER' && req.user.leaderLevel === 'ORGANIZATION') ? req.user.organization : organization;

  const user = await User.create({
    name,
    username,
    password,
    role,
    leaderLevel: leaderLevel || null,
    organization: userOrg,
    department,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
    });
  } else {
    res.status(400);
    throw new Error('Dữ liệu người dùng không hợp lệ');
  }
};

// cập nhật người dùng)
// @route   PUT /api/users/:id
const updateUser = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    // Permission check for LEADER (ORGANIZATION level)
    if (req.user.role === 'LEADER' && req.user.leaderLevel === 'ORGANIZATION' && user.organization.toString() !== req.user.organization.toString()) {
      res.status(403);
      throw new Error('Bạn không có quyền sửa người dùng của cơ quan khác');
    }

    user.name = req.body.name || user.name;
    user.username = req.body.username || user.username;
    user.role = req.body.role || user.role;
    user.leaderLevel = req.body.leaderLevel !== undefined ? req.body.leaderLevel : user.leaderLevel;
    user.department = req.body.department || user.department;
    
    if (req.user.role === 'SUPER_ADMIN') {
      user.organization = req.body.organization || user.organization;
    }

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      username: updatedUser.username,
      role: updatedUser.role,
    });
  } else {
    res.status(404);
    throw new Error('Không tìm thấy người dùng');
  }
};

//   (xóa người dùng )
// @route   DELETE /api/users/:id
const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    if (req.user.role === 'LEADER' && req.user.leaderLevel === 'ORGANIZATION' && user.organization.toString() !== req.user.organization.toString()) {

      res.status(403);
      throw new Error('Bạn không có quyền xóa người dùng của cơ quan khác');
    }

    if (user._id.toString() === req.user._id.toString()) {
      res.status(400);
      throw new Error('Bạn không thể tự xóa tài khoản của chính mình');
    }

    await User.deleteOne({ _id: user._id });
    res.json({ message: 'Đã xóa người dùng thành công' });
  } else {
    res.status(404);
    throw new Error('Không tìm thấy người dùng');
  }
};

// (lấy danh sách lãnh đạo trong cơ quan)
// @route   GET /api/users/leaders/:orgId
const getLeadersByOrg = async (req, res) => {
  const { orgId } = req.params;
  const { role } = req.query;

  // Use leaderLevel filter if provided
  const query = { organization: orgId, role: 'LEADER', isActive: true };
  const { leaderLevel } = req.query;
  if (leaderLevel === 'ALL') {
    // do not add leaderLevel to query, fetch both ORGANIZATION and DEPARTMENT leaders
  } else if (leaderLevel) {
    query.leaderLevel = leaderLevel;
  } else {
    query.leaderLevel = 'DEPARTMENT';
  }

  const leaders = await User.find(query)
    .select('name _id department')
    .populate('department', 'name');
  res.json(leaders);
};

// (lấy danh sách nhân viên trong phòng ban)
// @route   GET /api/users/by-dept/:deptId
const getEmployeesByDept = async (req, res) => {
  const { deptId } = req.params;
  const users = await User.find({ department: deptId })
    .select('name _id role leaderLevel')

    .sort({ name: 1 });
  res.json(users);
};

// (thay đổi mật khẩu cá nhân)
// @route   PUT /api/users/profile/password
const changePassword = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const { currentPassword, newPassword } = req.body;
    
    // Check old password
    if (!(await user.matchPassword(currentPassword))) {
      res.status(400);
      throw new Error('Mật khẩu hiện tại không đúng');
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Đổi mật khẩu thành công' });
  } else {
    res.status(404);
    throw new Error('Không tìm thấy người dùng');
  }
};

export { authUser, getUserProfile, getUsers, createUser, updateUser, deleteUser, getLeadersByOrg, getEmployeesByDept, changePassword };
