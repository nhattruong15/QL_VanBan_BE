import asyncHandler from 'express-async-handler';
import Organization from '../models/organizationModel.js';
import Document from '../models/documentModel.js';
import {
  generateKeyPair,
  signDocument,
  verifyDocument,
  buildSignableContent,
} from '../utils/digitalSignature.js';

// @desc    Tạo cặp khóa RSA cho tổ chức hiện tại
// @route   POST /api/signatures/generate-keys
// @access  Private (Admin)
export const generateOrgKeyPair = asyncHandler(async (req, res) => {
  const orgId = req.user.organization;

  if (!orgId) {
    res.status(400);
    throw new Error('Người dùng không thuộc tổ chức nào');
  }

  const org = await Organization.findById(orgId);
  if (!org) {
    res.status(404);
    throw new Error('Không tìm thấy tổ chức');
  }

  const { publicKey, privateKey } = generateKeyPair();

  org.publicKey = publicKey;
  org.privateKey = privateKey;
  await org.save();

  res.status(200).json({
    message: `Tạo khóa RSA thành công cho tổ chức: ${org.name}`,
    organizationId: org._id,
    organizationName: org.name,
    // Chỉ trả về public key, KHÔNG trả private key ra ngoài
    publicKey: publicKey,
  });
});

// @desc    Ký văn bản bằng Private Key của tổ chức gửi
// @route   POST /api/signatures/sign/:documentId
// @access  Private
export const signDoc = asyncHandler(async (req, res) => {
  const { documentId } = req.params;

  const doc = await Document.findById(documentId);
  if (!doc) {
    res.status(404);
    throw new Error('Không tìm thấy văn bản');
  }

  // Kiểm tra người ký phải là người gửi hoặc thuộc tổ chức gửi
  const senderOrgId = doc.sender.organization.toString();
  const userOrgId = req.user.organization?.toString();

  if (senderOrgId !== userOrgId) {
    res.status(403);
    throw new Error('Chỉ tổ chức gửi mới được ký văn bản này');
  }

  // Lấy private key của tổ chức gửi
  const senderOrg = await Organization.findById(senderOrgId);
  if (!senderOrg || !senderOrg.privateKey) {
    res.status(400);
    throw new Error(
      'Tổ chức gửi chưa có khóa RSA. Vui lòng tạo khóa trước (POST /api/signatures/generate-keys).'
    );
  }

  // Tạo nội dung chuẩn để ký
  const content = buildSignableContent(doc);

  // Ký văn bản
  const signature = signDocument(content, senderOrg.privateKey);

  // Cập nhật văn bản
  doc.signature = signature;
  doc.signerPublicKey = senderOrg.publicKey;
  doc.isSigned = true;
  doc.isVerified = false; // Reset xác minh khi ký lại

  // Ghi vào history
  doc.history.push({
    user: req.user._id,
    action: 'ĐÃ KÝ SỐ',
    note: `Văn bản được ký số bởi ${req.user.name} (${senderOrg.name})`,
  });

  await doc.save();

  res.status(200).json({
    message: 'Ký văn bản thành công',
    documentId: doc._id,
    isSigned: true,
    signedBy: req.user.name,
    organization: senderOrg.name,
    signature: signature,
  });
});

// @desc    Xác minh chữ ký số của văn bản
// @route   POST /api/signatures/verify/:documentId
// @access  Private
export const verifyDocSignature = asyncHandler(async (req, res) => {
  const { documentId } = req.params;

  const doc = await Document.findById(documentId);
  if (!doc) {
    res.status(404);
    throw new Error('Không tìm thấy văn bản');
  }

  if (!doc.isSigned || !doc.signature || !doc.signerPublicKey) {
    res.status(400);
    throw new Error('Văn bản này chưa được ký số');
  }

  // Tạo lại nội dung chuẩn (phải khớp với lúc ký)
  const content = buildSignableContent(doc);

  // Xác minh
  const isValid = verifyDocument(content, doc.signature, doc.signerPublicKey);

  // Cập nhật trạng thái xác minh
  doc.isVerified = isValid;

  // Ghi vào history
  doc.history.push({
    user: req.user._id,
    action: isValid ? 'XÁC MINH HỢP LỆ' : 'XÁC MINH THẤT BẠI',
    note: isValid
      ? `Chữ ký số hợp lệ - xác minh bởi ${req.user.name}`
      : `Chữ ký số KHÔNG hợp lệ hoặc văn bản đã bị chỉnh sửa - xác minh bởi ${req.user.name}`,
  });

  await doc.save();

  res.status(200).json({
    isValid,
    documentId: doc._id,
    message: isValid
      ? '✅ Chữ ký số hợp lệ. Văn bản toàn vẹn, không bị chỉnh sửa.'
      : '❌ Chữ ký số KHÔNG hợp lệ. Văn bản có thể đã bị giả mạo hoặc chỉnh sửa.',
    verifiedBy: req.user.name,
  });
});

// @desc    Lấy Public Key của một tổ chức (dùng để xác minh thủ công)
// @route   GET /api/signatures/public-key/:orgId
// @access  Private
export const getOrgPublicKey = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.params.orgId).select('name publicKey');

  if (!org) {
    res.status(404);
    throw new Error('Không tìm thấy tổ chức');
  }

  if (!org.publicKey) {
    res.status(404);
    throw new Error('Tổ chức này chưa tạo khóa RSA');
  }

  res.status(200).json({
    organizationId: org._id,
    organizationName: org.name,
    publicKey: org.publicKey,
  });
});

// @desc    Lấy trạng thái chữ ký của văn bản
// @route   GET /api/signatures/status/:documentId
// @access  Private
export const getDocSignatureStatus = asyncHandler(async (req, res) => {
  const doc = await Document.findById(req.params.documentId)
    .select('title isSigned isVerified signerPublicKey signature');

  if (!doc) {
    res.status(404);
    throw new Error('Không tìm thấy văn bản');
  }

  res.status(200).json({
    documentId: doc._id,
    title: doc.title,
    isSigned: doc.isSigned,
    isVerified: doc.isVerified,
    hasSignature: !!doc.signature,
    // Chỉ trả về 60 ký tự đầu của public key để hiển thị
    signerPublicKeyPreview: doc.signerPublicKey
      ? doc.signerPublicKey.substring(0, 60) + '...'
      : null,
  });
});
