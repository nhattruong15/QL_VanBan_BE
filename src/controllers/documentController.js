import asyncHandler from 'express-async-handler';
import Document from '../models/documentModel.js';

// (tạo văn bản mới)
// @route   POST /api/documents
const createDocument = asyncHandler(async (req, res) => {
  console.log('DEBUG: req.body:', req.body);
  console.log('DEBUG: req.files:', req.files);

  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400);
    throw new Error('Yêu cầu không hợp lệ: body trống hoặc không thể phân giải');
  }

  const { title, content, type, receiverOrgId, receiverDeptId, targetLeaderId, targetEmployeeId, status } = req.body;
  
  const attachments = req.files ? req.files.map(file => ({
    name: file.originalname,
    path: file.path.replace(/\\/g, '/'),
    size: file.size,
    mimetype: file.mimetype
  })) : [];

    // Xác định trạng thái ban đầu
    // - Cùng công ty (INTERNAL, EXPRESS, LEADER_SUBMIT): chuyển thẳng sang FORWARDED
    // - Khác công ty (OFFICIAL): cần qua văn thư (SENT)
    const isSameOrg = req.user.organization.toString() === receiverOrgId.toString();
    let initialStatus = 'DRAFT';
    if (status === 'SENT') {
      initialStatus = isSameOrg ? 'FORWARDED' : 'SENT';
    } else {
      initialStatus = status || 'DRAFT';
    }

    const document = await Document.create({
    title,
    content,
    type,
    sender: {
      user: req.user._id,
      organization: req.user.organization,
      department: req.user.department,
    },
    receiver: {
      organization: receiverOrgId,
      department: receiverDeptId || undefined,
      targetLeader: targetLeaderId || undefined,
      targetEmployee: targetEmployeeId || undefined,
    },
    status: initialStatus,
    attachments,
    history: [
      {
        user: req.user._id,
        action: 'CREATED',
        note: 'Văn bản đã được tạo',
      },
    ],
  });

  if (document) {
    res.status(201).json(document);
  } else {
    res.status(400);
    throw new Error('Invalid document data');
  }
});

//  (lấy văn bản cho người dùng/cơ quan)
// @route   GET /api/documents
const getDocuments = asyncHandler(async (req, res) => {
  const { direction } = req.query; // 'IN' or 'OUT'

  let query = {};

  if (req.user.role === 'SUPER_ADMIN') {
    //  (SUPER_ADMIN có thể xem tất cả các văn bản (cả IN và OUT) cho tất cả các cơ quan)
    query = {};
  } else if (direction === 'OUT') {
    //  (văn bản gửi từ cơ quan của tôi)
    query = { 'sender.organization': req.user.organization };
    if (['EMPLOYEE', 'LEADER'].includes(req.user.role) && req.user.department) {
      // chỉ xem văn bản gửi của phòng ban mình)
      query['sender.department'] = req.user.department;
    }
  } else if (direction === 'IN') {
    //  (văn bản nhận được bởi cơ quan của tôi)
    if (req.user.role === 'DISPATCHER') {
      // Văn thư chỉ thấy văn bản ĐÃ GỬI từ công ty KHÁC (cross-org, type OFFICIAL)
      // Văn bản nội bộ (INTERNAL, EXPRESS, LEADER_SUBMIT) không cần qua văn thư
      // Dự thảo (DRAFT_PUBLISH) không nằm ở đây
      query = { 
        'receiver.organization': req.user.organization,
        'sender.organization': { $ne: req.user.organization }, // chỉ văn bản từ ngoài vào
        status: { $in: ['SENT', 'FORWARDED', 'RECEIVED', 'PROCESSED'] } 
      };
    } else if (req.user.role === 'EMPLOYEE') {
      //  (chỉ xem văn bản được chuyển tiếp hoặc xử lý, được chuyển đến phòng ban cụ thể của họ)
      query = {
        'receiver.organization': req.user.organization,
        status: { $in: ['FORWARDED', 'PROCESSED'] },
        $or: [
          // Gửi cho cả phòng ban (không có targetEmployee)
          {
            'receiver.department': req.user.department,
            'receiver.targetEmployee': { $in: [null, undefined] },
            $nor: [{ 'receiver.targetEmployee': { $exists: true, $ne: null } }]
          },
          // Gửi đích danh cho nhân viên này
          { 'receiver.targetEmployee': req.user._id }
        ]
      };
    } else if (req.user.role === 'LEADER') {
      // Leader sees:
      // 1.  (Trình trưởng phòng)
      // 2.   (Trưởng phòng xem văn bản trình lên mình và văn bản chuyển đến phòng ban của mình)
      const leaderConditions = [
        {
          'receiver.organization': req.user.organization,
          'receiver.targetLeader': req.user._id,
          type: 'EXPRESS',
          status: { $in: ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] },
        },
      ];
      if (req.user.department) {
        leaderConditions.push({
          'receiver.organization': req.user.organization,
          'receiver.department': req.user.department,
          type: { $nin: ['LEADER_SUBMIT', 'EXPRESS'] },
          status: { $in: ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] },
        });
      }
      query = { $or: leaderConditions };
    } else if (req.user.role === 'ADMIN') {
      // ADMIN (Lãnh đạo) chỉ thấy văn bản gửi đích danh cho mình
      query = { 
        'receiver.organization': req.user.organization,
        'receiver.targetLeader': req.user._id,
        type: { $ne: 'DRAFT_PUBLISH' },
        status: { $in: ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] }
      };

    } else {
      query = { 'receiver.organization': req.user.organization };
    }
  } else if (direction === 'DRAFT' && ['ADMIN', 'DISPATCHER'].includes(req.user.role)) {
    //  (văn bản dự thảo gửi đến Lãnh đạo hoặc chờ Văn thư ban hành)
    if (req.user.role === 'ADMIN') {
      query = {
        'receiver.organization': req.user.organization,
        'receiver.targetLeader': req.user._id,
        type: 'DRAFT_PUBLISH',
        status: { $in: ['FORWARDED', 'PENDING_PUBLISH', 'PROCESSED', 'REJECTED'] }
      };
    } else if (req.user.role === 'DISPATCHER') {
      query = {
        'receiver.organization': req.user.organization,
        type: 'DRAFT_PUBLISH',
        status: { $in: ['PENDING_PUBLISH', 'PROCESSED'] }
      };
    }
  } else {
    query = {
      $or: [
        { 'sender.organization': req.user.organization },
        { 'receiver.organization': req.user.organization }
      ]
    };
  }

  const documents = await Document.find(query)
    .populate('sender.user', 'name role')
    .populate('sender.organization', 'name')
    .populate('sender.department', 'name')
    .populate('receiver.organization', 'name')
    .populate('receiver.department', 'name')
    .populate({ path: 'receiver.targetLeader', select: 'name department role', populate: { path: 'department', select: 'name' } })
    .populate('receiver.targetEmployee', 'name role')
    .sort({ createdAt: -1 });

  res.json(documents);
});

//  (cập nhật trạng thái văn bản)
// @route   PUT /api/documents/:id/status
const updateDocumentStatus = asyncHandler(async (req, res) => {
  let { status, note, receiverDeptId, targetEmployeeId, delegatedByLeader } = req.body;
  const document = await Document.findById(req.params.id);

  if (document) {
    const isSendingInternally = status === 'SENT' && document.sender.organization.toString() === document.receiver.organization.toString();
    if (isSendingInternally) {
      status = 'FORWARDED';
    }
    document.status = status;
    if (receiverDeptId) {
      document.receiver.department = receiverDeptId;
    }
    if (targetEmployeeId) {
      document.receiver.targetEmployee = targetEmployeeId;
    } else if (delegatedByLeader) {
      // Clear targetEmployee if re-delegating to whole dept (not specific person)
      document.receiver.targetEmployee = undefined;
    }

    //  (tự động tạo số văn bản nếu được đánh dấu là hoàn thành (ĐÃ GỬI hoặc ĐÃ XỬ LÝ) và nó chưa có số)
    if ((status === 'PROCESSED' || status === 'SENT' || isSendingInternally) && !document.documentNumber) {
      await document.populate('sender.organization');
      const orgCode = document.sender.organization.code || 'BTP';
      const currentYear = new Date().getFullYear();
      
      const startOfYear = new Date(currentYear, 0, 1);
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);
      
      const count = await Document.countDocuments({
        'sender.organization': document.sender.organization._id,
        documentNumber: { $exists: true, $ne: null },
        createdAt: { $gte: startOfYear, $lte: endOfYear }
      });
      
      document.documentNumber = `${count + 1}/${orgCode}`;
    }

    const action = delegatedByLeader
      ? 'DELEGATED_TO_DEPT'
      : `STATUS_CHANGED_TO_${status}`;

    document.history.push({
      user: req.user._id,
      action,
      note: note || '',
    });

    const updatedDocument = await document.save();
    res.json(updatedDocument);
  } else {
    res.status(404);
    throw new Error('Document not found');
  }
});


// @desc     (lấy văn bản theo ID)
// @route   GET /api/documents/:id
const getDocumentById = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id)
    .populate('sender.user', 'name role')
    .populate('sender.organization', 'name')
    .populate('sender.department', 'name')
    .populate('receiver.organization', 'name')
    .populate('receiver.department', 'name')
    .populate({ path: 'receiver.targetLeader', select: 'name department role', populate: { path: 'department', select: 'name' } })
    .populate('receiver.targetEmployee', 'name role');

  if (document) {
    res.json(document);
  } else {
    res.status(404);
    throw new Error('Document not found');
  }
});

// @desc    Get organization statistics for dashboard
// @route   GET /api/documents/stats/organization
const getOrgStats = asyncHandler(async (req, res) => {
  const orgId = req.user.organization;
  const depId = req.user.department;
  const userId = req.user._id;
  const role = req.user.role;

  // Xây dựng điều kiện ĐẾN (Incoming) giống y hệt /documents?direction=IN
  let baseInQuery = { 'receiver.organization': orgId };
  if (role === 'LEADER') {
    const leaderConditions = [
      { 'receiver.targetLeader': userId, type: 'EXPRESS' }
    ];
    if (depId) {
      leaderConditions.push({
        'receiver.department': depId,
        type: { $nin: ['LEADER_SUBMIT', 'EXPRESS'] }
      });
    }
    baseInQuery.$or = leaderConditions;
  } else if (role === 'ADMIN') {
    baseInQuery['receiver.targetLeader'] = userId;
    baseInQuery['type'] = { $ne: 'DRAFT_PUBLISH' };
  }

  // Điều kiện STATUS của Incoming giống y hệt getDocuments
  baseInQuery.status = { $in: ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] };

  // Xây dựng điều kiện ĐI (Outgoing) giống y hệt /documents?direction=OUT
  let baseOutQuery = { 'sender.organization': orgId };
  if (role === 'LEADER' && depId) {
    baseOutQuery['sender.department'] = depId;
  }

  // Incoming
  const incomingProcessed = await Document.countDocuments({ ...baseInQuery, status: 'PROCESSED' });
  const incomingUnprocessed = await Document.countDocuments({ ...baseInQuery, status: { $ne: 'PROCESSED' } });

  // Outgoing
  // Ở màn Văn bản đi, filter là filter(d => d.status !== 'PROCESSED') nhưng getDocuments không chặn status, 
  // do đó đếm status không phải 'PROCESSED', 'DRAFT', 'CANCELLED'
  const outgoingProcessed = await Document.countDocuments({ ...baseOutQuery, status: 'PROCESSED' });
  const outgoingUnprocessed = await Document.countDocuments({ ...baseOutQuery, status: { $nin: ['PROCESSED', 'DRAFT', 'CANCELLED'] } });

  res.json({
    processed: incomingProcessed + outgoingProcessed,
    unprocessed: incomingUnprocessed + outgoingUnprocessed,
    details: {
      incoming: { processed: incomingProcessed, unprocessed: incomingUnprocessed },
      outgoing: { processed: outgoingProcessed, unprocessed: outgoingUnprocessed }
    }
  });

});


export { createDocument, getDocuments, updateDocumentStatus, getDocumentById, getOrgStats };
