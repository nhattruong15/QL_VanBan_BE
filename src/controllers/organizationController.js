import asyncHandler from 'express-async-handler';
import Organization from '../models/organizationModel.js';
import User from '../models/userModel.js';
//  (lấy tất cả các cơ quan)
// @route   GET /api/organizations
const getOrganizations = asyncHandler(async (req, res) => {
  let query = {};
  //  (Loại bỏ hạn chế: cho phép người dùng xem cơ quan của họ để gửi tài liệu nội bộ)
  // if (req.user && req.user.role !== 'SUPER_ADMIN' && req.user.organization) {
  //   query = { _id: { $ne: req.user.organization } };
  // }
  
  const organizations = await Organization.find(query);
  res.json(organizations);
});

//  (Tạo cơ quan mới)
// @route   POST /api/organizations
const createOrganization = asyncHandler(async (req, res) => {
  const { name, code, address, phone, email } = req.body;

  const organizationExists = await Organization.findOne({ code });

  if (organizationExists) {
    res.status(400);
    throw new Error('Cơ quan với mã này đã tồn tại');
  }

  const organization = await Organization.create({
    name,
    code,
    address,
    phone,
    email,
  });

  if (organization) {
    res.status(201).json(organization);
  } else {
    res.status(400);
    throw new Error('Dữ liệu cơ quan không hợp lệ');
  }
});

//  (cập nhật cơ quan)
// @route   PUT /api/organizations/:id
const updateOrganization = asyncHandler(async (req, res) => {
  const { name, code, address, phone, email } = req.body;
  
  const organization = await Organization.findById(req.params.id);

  if (organization) {
    if (code && code !== organization.code) {
        const organizationExists = await Organization.findOne({ code });
        if (organizationExists) {
            res.status(400);
            throw new Error('Cơ quan với mã này đã tồn tại');
        }
    }

    organization.name = name || organization.name;
    organization.code = code || organization.code;
    organization.address = address || organization.address;
    organization.phone = phone || organization.phone;
    organization.email = email || organization.email;

    const updatedOrganization = await organization.save();
    res.json(updatedOrganization);
  } else {
    res.status(404);
    throw new Error('Không tìm thấy cơ quan');
  }
});

//  (xóa cơ quan)
// @route   DELETE /api/organizations/:id
const deleteOrganization = asyncHandler(async (req, res) => {
  const organization = await Organization.findById(req.params.id);

  if (organization) {
    const defaultUserExists = await User.findOne({ organization: req.params.id });
    if (defaultUserExists) {
        res.status(400);
        throw new Error('Không thể xóa vì còn người dùng thuộc cơ quan này');
    }

    await Organization.deleteOne({ _id: req.params.id });
    res.json({ message: 'Đã xóa cơ quan' });
  } else {
    res.status(404);
    throw new Error('Không tìm thấy cơ quan');
  }
});

export { getOrganizations, createOrganization, updateOrganization, deleteOrganization };
