import asyncHandler from 'express-async-handler';
import Document from '../models/documentModel.js';
import Notification from '../models/notificationModel.js';
import User from '../models/userModel.js';

// (tạo văn bản mới)
// @route   POST /api/documents
const createDocument = asyncHandler(async (req, res) => {
  console.log('DEBUG: req.body:', req.body);
  console.log('DEBUG: req.files:', req.files);

  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400);
    throw new Error('Yêu cầu không hợp lệ: body trống hoặc không thể phân giải');
  }

  const { title, content, type, receiverOrgId, receiverDeptId, targetLeaderId, targetEmployeeId, status, issuingOrganizations, signerId } = req.body;

  
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
    // Thông tin dự thảo văn bản
    ...(type === 'DRAFT_PUBLISH' && {
      issuingOrganizations: issuingOrganizations
        ? (Array.isArray(issuingOrganizations) ? issuingOrganizations : JSON.parse(issuingOrganizations))
        : [],
      signer: signerId || undefined,
    }),
    history: [
      {
        user: req.user._id,
        action: 'CREATED',
        note: 'Văn bản đã được tạo',
      },
    ],
  });

  if (document) {
    // Create notifications
    if (initialStatus !== 'DRAFT') {
      const recipients = [];
      if (initialStatus === 'SENT') {
        // Notify dispatchers of receiver org
        const dispatchers = await User.find({ organization: receiverOrgId, role: 'DISPATCHER' });
        recipients.push(...dispatchers.map(u => u._id));
      } else if (initialStatus === 'FORWARDED') {
        // Nội bộ: thông báo cho văn thư
        const dispatchers = await User.find({ organization: receiverOrgId, role: 'DISPATCHER' });
        recipients.push(...dispatchers.map(u => u._id));
        // Và thông báo cho người nhận cụ thể
        if (targetEmployeeId) {
          recipients.push(targetEmployeeId);
        } else if (targetLeaderId) {
          recipients.push(targetLeaderId);
        } else if (receiverDeptId) {
          // Notify all users in dept
          const deptUsers = await User.find({ department: receiverDeptId });
          recipients.push(...deptUsers.map(u => u._id));
        }
      }

      for (const recipientId of [...new Set(recipients)]) {
        await Notification.create({
          recipient: recipientId,
          document: document._id,
          message: `Văn bản mới: ${title}`,
          type: 'NEW_DOCUMENT'
        });
      }
    }
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
    // Văn bản đi = TẤT CẢ văn bản do người gửi tạo ra (kể cả nội bộ)
    // Người gửi luôn thấy những gì họ đã gửi
    query = { 'sender.organization': req.user.organization };
    if (req.user.role === 'EMPLOYEE' && req.user.department) {
      query['sender.department'] = req.user.department;
    } else if (req.user.role === 'LEADER') {
      query['sender.user'] = req.user._id;
    } else if (req.user.role === 'DISPATCHER' || req.user.role === 'ADMIN') {
      // Đối với Văn thư/Quản trị: văn bản đi chỉ là văn bản gửi cho CÔNG TY KHÁC
      query.$expr = { $ne: ['$sender.organization', '$receiver.organization'] };
    }
  } else if (direction === 'IN') {
    //  (văn bản nhận được bởi cơ quan của tôi)
    if (req.user.role === 'DISPATCHER') {
      // Văn thư thấy tất cả văn bản đến tổ chức của mình:
      // - Văn bản từ công ty khác (SENT) - cần văn thư tiếp nhận
      // - Văn bản nội bộ (FORWARDED) - gửi trực tiếp trong cùng tổ chức
      // Loại trừ văn bản do chính văn thư gửi
      query = { 
        'receiver.organization': req.user.organization,
        'sender.user': { $ne: req.user._id },
        status: { $in: ['SENT', 'FORWARDED', 'RECEIVED', 'PROCESSED'] } 
      };
    } else if (req.user.role === 'EMPLOYEE') {
      //  (chỉ xem văn bản được chuyển tiếp hoặc xử lý, được chuyển đến phòng ban cụ thể của họ)
      query = {
        'receiver.organization': req.user.organization,
        'sender.user': { $ne: req.user._id },
        status: { $in: ['FORWARDED', 'PROCESSED'] },
        $or: [
          // Gửi cho cả phòng ban (không có targetEmployee)
          {
            'receiver.department': req.user.department,
            'receiver.targetEmployee': { $in: [null, undefined] },
            $nor: [{ 'receiver.targetEmployee': { $exists: true, $ne: null } }]
          },
          { 'receiver.targetEmployee': req.user._id }
        ]
      };
    } else if (req.user.role === 'LEADER' && req.user.leaderLevel === 'DEPARTMENT') {
      const leaderConditions = [
        {
          'receiver.organization': req.user.organization,
          'receiver.targetLeader': req.user._id,
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
      query = { 
        $or: leaderConditions,
        'sender.user': { $ne: req.user._id }
      };
    } else if (req.user.role === 'LEADER' && req.user.leaderLevel === 'ORGANIZATION') {
      query = { 
        'receiver.organization': req.user.organization,
        'sender.user': { $ne: req.user._id },
        type: { $ne: 'DRAFT_PUBLISH' },
        status: { $in: ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] }
      };
    } else {
      query = { 
        'receiver.organization': req.user.organization,
        'sender.user': { $ne: req.user._id }
      };
    }
  } else if (direction === 'DRAFT' && (req.user.role === 'DISPATCHER' || (req.user.role === 'LEADER' && req.user.leaderLevel === 'ORGANIZATION'))) {
    if (req.user.role === 'LEADER' && req.user.leaderLevel === 'ORGANIZATION') {
      query = {
        'receiver.organization': req.user.organization,
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
    .populate('signer', 'name role')
    .populate('issuingOrganizations', 'name')
    .sort({ createdAt: -1 });

  res.json(documents);
});

//  (cập nhật trạng thái văn bản)
// @route   PUT /api/documents/:id/status
const updateDocumentStatus = asyncHandler(async (req, res) => {
  let { status, note, receiverDeptId, targetEmployeeId, delegatedByLeader } = req.body;
  const document = await Document.findById(req.params.id);

  if (document) {
    const originalStatus = document.status;
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
      document.receiver.targetEmployee = undefined;
    }

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

    // -- BAN HÀNH DỰ THẢO VĂN BẢN (DRAFT_PUBLISH) --
    if (document.type === 'DRAFT_PUBLISH' && originalStatus === 'PENDING_PUBLISH' && status === 'PROCESSED') {
      const issuingOrgs = document.issuingOrganizations || [];
      if (issuingOrgs.length > 0) {
        const clonedDocs = [];
        for (const orgId of issuingOrgs) {
          const isInternalCopy = orgId.toString() === document.sender.organization.toString();
          const targetStatus = isInternalCopy ? 'FORWARDED' : 'SENT'; // Nội bộ thì trực tiếp FORWARDED, ngoài thì SENT (chờ văn thư)
          
          clonedDocs.push({
            title: document.title,
            content: document.content,
            type: document.type,
            documentNumber: document.documentNumber, 
            sender: {
              user: document.sender.user,
              organization: document.sender.organization,
              department: document.sender.department,
            },
            receiver: {
              organization: orgId,
            },
            status: targetStatus,
            attachments: document.attachments,
            signature: document.signature,
            signerPublicKey: document.signerPublicKey,
            signer: document.signer,
            isSigned: document.isSigned,
            history: [{
              user: req.user._id,
              action: 'CREATED',
              note: `Văn bản được ban hành từ dự thảo gốc "${document.title}"`,
              timestamp: new Date()
            }, {
              user: req.user._id,
              action: `STATUS_CHANGED_TO_${targetStatus}`,
              note: `Văn thư phát hành đến cơ quan tiếp nhận`,
              timestamp: new Date()
            }]
          });
        }
        
        // Insert copied documents
        const insertedDocs = await Document.insertMany(clonedDocs);

        // Notify dispatchers of target organizations
        for (const newDoc of insertedDocs) {
          const dispatchers = await User.find({ organization: newDoc.receiver.organization, role: 'DISPATCHER' });
          if (dispatchers.length > 0) {
            await Notification.insertMany(dispatchers.map(d => ({
              recipient: d._id,
              document: newDoc._id,
              message: `Có văn bản ban hành mới: "${newDoc.title}"`,
              type: 'NEW_DOCUMENT'
            })));
          }
        }
      }
    }

    const recipients = [];
    if (status === 'FORWARDED') {
      // Thông báo cho văn thư khi có văn bản nội bộ
      const dispatchers = await User.find({ organization: document.receiver.organization, role: 'DISPATCHER' });
      recipients.push(...dispatchers.map(u => u._id));
      // Và cho người nhận cụ thể
      if (document.receiver.targetEmployee) {
        recipients.push(document.receiver.targetEmployee);
      } else if (document.receiver.targetLeader) {
        recipients.push(document.receiver.targetLeader);
      } else if (document.receiver.department) {
        const deptUsers = await User.find({ department: document.receiver.department });
        recipients.push(...deptUsers.map(u => u._id));
      }
    } else if (['REJECTED', 'PROCESSED', 'RECEIVED'].includes(status)) {
      recipients.push(document.sender.user);
    } else if (status === 'SENT' && document.sender.organization.toString() !== document.receiver.organization.toString()) {
       const dispatchers = await User.find({ organization: document.receiver.organization, role: 'DISPATCHER' });
       recipients.push(...dispatchers.map(u => u._id));
    }

    for (const recipientId of [...new Set(recipients)]) {
      if (recipientId.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: recipientId,
          document: document._id,
          message: `Văn bản "${document.title}" ${status === 'PROCESSED' ? 'đã được xử lý' : status === 'REJECTED' ? 'bị từ chối' : 'có trạng thái mới: ' + status}`,
          type: 'STATUS_UPDATE'
        });
      }
    }

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
    .populate('receiver.targetEmployee', 'name role')
    .populate('signer', 'name role leaderLevel')
    .populate('issuingOrganizations', 'name');

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
  const leaderLevel = req.user.leaderLevel;

  // Xây dựng điều kiện ĐẾN (Incoming) giống y hệt /documents?direction=IN
  let baseInQuery = { 'receiver.organization': orgId };
  if (role === 'LEADER' && leaderLevel === 'DEPARTMENT') {
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
  } else if (role === 'LEADER' && leaderLevel === 'ORGANIZATION') {
    // Lãnh đạo tổ chức thấy toàn bộ
    baseInQuery['type'] = { $ne: 'DRAFT_PUBLISH' };
  }

  // Điều kiện STATUS của Incoming giống y hệt getDocuments
  baseInQuery.status = { $in: (role === 'DISPATCHER') ? ['SENT', 'FORWARDED', 'RECEIVED', 'PROCESSED'] : ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] };
  baseInQuery['sender.user'] = { $ne: userId };

  // Xây dựng điều kiện ĐI (Outgoing) = tất cả văn bản do người dùng gửi
  let baseOutQuery = { 'sender.organization': orgId };
  if (role === 'LEADER') {
    baseOutQuery['sender.user'] = userId;
  } else if (role === 'DISPATCHER' || role === 'ADMIN') {
    // Đối với Văn thư/Quản trị: văn bản đi chỉ là văn bản gửi cho CÔNG TY KHÁC
    baseOutQuery.$expr = { $ne: ['$sender.organization', '$receiver.organization'] };
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
