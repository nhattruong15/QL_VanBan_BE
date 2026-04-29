import asyncHandler from 'express-async-handler';
import Department from '../models/departmentModel.js';
import User from '../models/userModel.js';
//  (lấy phòng ban theo cơ quan)
// @route   GET /api/departments/org/:orgId
const getDepartmentsByOrg = asyncHandler(async (req, res) => {
  console.log(`DEBUG: Fetching departments for orgId: ${req.params.orgId}`);
  const departments = await Department.find({ organization: req.params.orgId });
  console.log(`DEBUG: Found ${departments.length} departments`);
  res.json(departments);
});

//  (tạo phòng ban mới)
// @route   POST /api/departments
const createDepartment = asyncHandler(async (req, res) => {
  const { name, code, organizationId } = req.body;

  // (Xác định phòng ban thuộc cơ quan nào)
  let targetOrgId;
  if (req.user.role === 'SUPER_ADMIN') {
    if (!organizationId) {
      res.status(400);
      throw new Error('Cần cung cấp ID cơ quan');
    }
    targetOrgId = organizationId;
  } else {
    targetOrgId = req.user.organization;
    if (!targetOrgId) {
      res.status(400);
      throw new Error('Bạn không thuộc cơ quan nào, không thể tạo phòng ban');
    }
  }

  const departmentExists = await Department.findOne({ code, organization: targetOrgId });

  if (departmentExists) {
    res.status(400);
    throw new Error('Phòng ban với mã này đã tồn tại trong cơ quan');
  }

  const department = await Department.create({
    name,
    code,
    organization: targetOrgId,
  });

  if (department) {
    res.status(201).json(department);
  } else {
    res.status(400);
    throw new Error('Dữ liệu phòng ban không hợp lệ');
  }
});

//  (cập nhật phòng ban)
// @route   PUT /api/departments/:id
const updateDepartment = asyncHandler(async (req, res) => {
  const { name, code } = req.body;
  
  const department = await Department.findById(req.params.id);

  if (department) {
    // Chỉ SUPER_ADMIN mới được sửa mọi cơ quan. ADMIN chỉ được sửa cơ quan của mình.
    if (req.user.role !== 'SUPER_ADMIN' && department.organization.toString() !== req.user.organization.toString()) {
      res.status(403);
      throw new Error('Bạn không có quyền chỉnh sửa phòng ban của cơ quan khác');
    }
    if (code && code !== department.code) {
        const departmentExists = await Department.findOne({ code, organization: department.organization });
        if (departmentExists) {
            res.status(400);
            throw new Error('Phòng ban với mã này đã tồn tại trong cơ quan');
        }
    }

    department.name = name || department.name;
    department.code = code || department.code;

    const updatedDepartment = await department.save();
    res.json(updatedDepartment);
  } else {
    res.status(404);
    throw new Error('Không tìm thấy phòng ban');
  }
});

//  (xóa phòng ban)
// @route   DELETE /api/departments/:id
const deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);

  if (department) {
    // Chỉ SUPER_ADMIN mới được xóa ở mọi cơ quan. ADMIN chỉ được xóa ở cơ quan của mình.
    if (req.user.role !== 'SUPER_ADMIN' && department.organization.toString() !== req.user.organization.toString()) {
      res.status(403);
      throw new Error('Bạn không có quyền xóa phòng ban của cơ quan khác');
    }
    const defaultUserExists = await User.findOne({ department: req.params.id });
    if (defaultUserExists) {
        res.status(400);
        throw new Error('Không thể xóa vì còn người dùng thuộc phòng ban này');
    }

    await Department.deleteOne({ _id: req.params.id });
    res.json({ message: 'Đã xóa phòng ban' });
  } else {
    res.status(404);
    throw new Error('Không tìm thấy phòng ban');
  }
});

export { getDepartmentsByOrg, createDepartment, updateDepartment, deleteDepartment };
