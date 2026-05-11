import asyncHandler from 'express-async-handler';
import Document from '../models/documentModel.js';
import Notification from '../models/notificationModel.js';
import User from '../models/userModel.js';
import Department from '../models/departmentModel.js';

// (tạo văn bản mới)
// @route   POST /api/documents
const createDocument = asyncHandler(async (req, res) => {
  console.log('DEBUG: req.body:', req.body);
  console.log('DEBUG: req.files:', req.files);

  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400);
    throw new Error('Yêu cầu không hợp lệ: body trống hoặc không thể phân giải');
  }

  const { title, content, type, category, receiverOrgId, receiverDeptId, targetLeaderId, targetEmployeeId, status, issuingOrganizations, signerId } = req.body;

  
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
    category: category || 'Công văn',
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
    // Loại trừ bản sao được tạo khi ban hành DRAFT_PUBLISH (isPublishedCopy: true)
    query = { 
      'sender.organization': req.user.organization,
      isPublishedCopy: { $ne: true }
    };
    if (req.user.role === 'EMPLOYEE') {
      query['sender.user'] = req.user._id;
    } else if (req.user.role === 'LEADER') {
      if (req.user.leaderLevel === 'ORGANIZATION') {
        // Lãnh đạo cơ quan thấy: văn bản do chính mình gửi + tất cả văn bản cross-org của tổ chức cần duyệt
        query.$or = [
          {
            'sender.user': req.user._id,
            $or: [
              { type: { $ne: 'DRAFT_PUBLISH' } },
              { type: 'DRAFT_PUBLISH', issuingOrganizations: { $exists: true, $not: { $size: 0 } } }
            ]
          },
          {
            $expr: { $ne: ['$sender.organization', '$receiver.organization'] },
            type: { $ne: 'DRAFT_PUBLISH' }
          },
          {
            type: 'DRAFT_PUBLISH',
            'sender.organization': req.user.organization,
            issuingOrganizations: { $elemMatch: { $ne: req.user.organization } },
            status: { $in: ['FORWARDED', 'PENDING_PUBLISH', 'PROCESSED', 'REJECTED'] }
          },
          // DRAFT_PUBLISH nội bộ có người ký là Lãnh đạo cơ quan này
          {
            type: 'DRAFT_PUBLISH',
            'sender.organization': req.user.organization,
            signer: req.user._id,
            status: { $in: ['FORWARDED', 'PENDING_PUBLISH', 'PROCESSED', 'REJECTED'] }
          }
        ];
      } else {
        // Trưởng phòng chỉ thấy văn bản đi do chính mình gửi hoặc mình là người ký
        query.$or = [
          {
            'sender.user': req.user._id,
            $or: [
              { type: { $ne: 'DRAFT_PUBLISH' } },
              { type: 'DRAFT_PUBLISH', issuingOrganizations: { $exists: true, $not: { $size: 0 } } }
            ]
          },
          {
            type: 'DRAFT_PUBLISH',
            signer: req.user._id,
            status: { $in: ['FORWARDED', 'PENDING_PUBLISH', 'PROCESSED', 'REJECTED'] }
          }
        ];
      }
    } else if (req.user.role === 'DISPATCHER' || req.user.role === 'ADMIN') {
      // Văn thư: văn bản đi công ty khác + ALL DRAFT_PUBLISH (nội bộ và liên cơ quan) đang chờ phát hành
      query.$or = [
        {
          // Văn bản cross-org thông thường (không phải DRAFT_PUBLISH)
          $expr: { $ne: ['$sender.organization', '$receiver.organization'] },
          type: { $ne: 'DRAFT_PUBLISH' }
        },
        {
          // DRAFT_PUBLISH gốc (chưa ban hành hoặc đang xử lý) - bao gồm cả dự thảo nội bộ
          type: 'DRAFT_PUBLISH',
          'sender.organization': req.user.organization,
          status: { $in: ['FORWARDED', 'PENDING_PUBLISH', 'PROCESSED', 'REJECTED'] }
        }
      ];
    }
  } else if (direction === 'IN') {
    //  (văn bản nhận được bởi cơ quan của tôi)
    if (req.user.role === 'DISPATCHER') {
      // Văn thư thấy tất cả văn bản đến tổ chức của mình:
      // - Văn bản từ công ty khác (SENT) - cần văn thư tiếp nhận
      // - Văn bản nội bộ (FORWARDED) - gửi trực tiếp trong cùng tổ chức
      // Loại trừ văn bản do chính văn thư gửi VÀ bản sao của DRAFT_PUBLISH nội bộ
      query = { 
        'receiver.organization': req.user.organization,
        'sender.user': { $ne: req.user._id },
        $or: [
          { isPublishedCopy: { $ne: true } },
          { 'sender.organization': { $ne: req.user.organization } }
        ],
        status: { $in: ['SENT', 'FORWARDED', 'RECEIVED', 'PROCESSED'] } 
      };
    } else if (req.user.role === 'EMPLOYEE') {
      //  (chỉ xem văn bản được chuyển tiếp hoặc xử lý, được chuyển đến phòng ban cụ thể của họ)
      query = {
        'receiver.organization': req.user.organization,
        'sender.user': { $ne: req.user._id },
        status: { $in: ['FORWARDED', 'PROCESSED'] },
        $or: [
          { 'receiver.department': req.user.department, 'receiver.targetEmployee': null },
          { 'receiver.department': req.user.department, 'receiver.targetEmployee': { $exists: false } },
          { 'receiver.targetEmployee': req.user._id }
        ]
      };
    } else if (req.user.role === 'LEADER' && req.user.leaderLevel === 'DEPARTMENT') {
      const leaderConditions = [
        {
          // Văn bản gửi đích danh đến trưởng phòng này (kể cả DRAFT_PUBLISH nội bộ)
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
      const myOrgId = req.user.organization;
      query = { 
        'receiver.organization': myOrgId,
        'sender.user': { $ne: req.user._id },
        status: { $in: ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] },
        $or: [
          // 1. Luôn xem văn bản từ CÔNG TY KHÁC ĐẾN
          { 'sender.organization': { $ne: myOrgId } },
          
          // 2. Với văn bản NỘI BỘ, chỉ xem nếu:
          { 
            $and: [
              { 'sender.organization': myOrgId },
              {
                $or: [
                  // Được phân công đích danh
                  { 'receiver.targetLeader': req.user._id },
                  // Chưa phân định phòng ban
                  { 'receiver.department': { $exists: false } },
                  { 'receiver.department': null }
                ]
              },
              // Loại trừ chính các bản dự thảo đang chờ ban hành của công ty mình (vì nó nằm ở văn bản đi)
              { type: { $ne: 'DRAFT_PUBLISH' } }
            ]
          }
        ]
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
  let { status, note, receiverDeptId, targetEmployeeId, delegatedByLeader, internalDeptIds } = req.body;
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

    let historyNote = note || '';
    if (!historyNote && status === 'PROCESSED' && document.type === 'DRAFT_PUBLISH') {
      historyNote = 'Văn bản đã được ban hành';
    }

    document.history.push({
      user: req.user._id,
      action,
      note: historyNote,
    });

    const updatedDocument = await document.save();

    // -- BAN HÀNH DỰ THẢO VĂN BẢN (DRAFT_PUBLISH) --
    if (document.type === 'DRAFT_PUBLISH' && originalStatus === 'PENDING_PUBLISH' && status === 'PROCESSED') {
      let issuingOrgs = document.issuingOrganizations || [];
      
      // Đảm bảo tổ chức hiện tại có trong danh sách nếu có chọn phòng ban nội bộ
      const myOrgIdStr = req.user.organization.toString();
      const hasInternal = issuingOrgs.some(id => id.toString() === myOrgIdStr);
      if (internalDeptIds && !hasInternal) {
        issuingOrgs.push(req.user.organization);
      }

      if (issuingOrgs.length > 0) {
        const clonedDocs = [];
        for (const orgId of issuingOrgs) {
          const senderOrgId = document.sender.organization._id || document.sender.organization;
          const isInternalCopy = orgId.toString() === senderOrgId.toString();

          if (isInternalCopy) {
            // --- BAN HÀNH NỘI BỘ: Tạo bản sao cho từng phòng ban ---
            let targetDepts = [];

            if (internalDeptIds && internalDeptIds !== 'ALL' && internalDeptIds.length > 0) {
              // Văn thư chọn cụ thể các phòng ban
              targetDepts = Array.isArray(internalDeptIds) ? internalDeptIds : [internalDeptIds];
            } else {
              // Văn thư chọn "Toàn bộ" - lấy hết phòng ban trong tổ chức
              const allDepts = await Department.find({ organization: orgId });
              targetDepts = allDepts.map(d => d._id.toString());
            }

            for (const deptId of targetDepts) {
              clonedDocs.push({
                title: document.title,
                content: document.content,
                type: document.type,
                category: document.category,
                documentNumber: document.documentNumber,
                sender: {
                  user: req.user._id,
                  organization: req.user.organization,
                  department: req.user.department,
                },
                receiver: {
                  organization: orgId,
                  department: deptId,
                },
                status: 'FORWARDED',
                attachments: document.attachments,
                signature: document.signature,
                signerPublicKey: document.signerPublicKey,
                signer: document.signer,
                isSigned: document.isSigned,
                isPublishedCopy: true, // Đánh dấu đây là bản sao ban hành, không hiện trong danh sách gốc
                issuingOrganizations: document.issuingOrganizations,
                history: [{
                user: req.user._id,
                action: 'CREATED',
                note: `Văn bản được ban hành nội bộ từ dự thảo gốc "${document.title}"`,
                timestamp: new Date()
              }, {
                user: req.user._id,
                action: 'DOCUMENT_PUBLISHED',
                note: `Văn thư ban hành đến phòng ban nội bộ`,
                timestamp: new Date()
              }]
              });
            }
          } else {
            // --- BAN HÀNH RA NGOÀI: Gửi đến công ty khác để Văn thư xét duyệt ---
            clonedDocs.push({
            title: document.title,
            content: document.content,
            type: document.type,
            category: document.category,
            documentNumber: document.documentNumber, 
            sender: {
              user: req.user._id, // Văn thư là người ban hành/gửi đi
              organization: req.user.organization,
              department: req.user.department,
            },
            receiver: {
              organization: orgId,
            },
            status: 'SENT', // Gửi đến văn thư công ty ngoài để xét duyệt
            attachments: document.attachments,
            signature: document.signature,
            signerPublicKey: document.signerPublicKey,
            signer: document.signer,
            isSigned: document.isSigned,
            isPublishedCopy: true, // Đánh dấu đây là bản sao ban hành, không hiện trong danh sách gốc
            // Quan trọng: Phải giữ issuingOrganizations để các query phân biệt được nguồn gốc
            issuingOrganizations: document.issuingOrganizations,
              history: [{
                user: req.user._id,
                action: 'CREATED',
                note: `Văn bản được ban hành từ dự thảo gốc "${document.title}"`,
                timestamp: new Date()
              }, {
                user: req.user._id,
                action: `STATUS_CHANGED_TO_SENT`,
                note: `Văn thư phát hành đến cơ quan tiếp nhận`,
                timestamp: new Date()
              }]
            });
          }
        }
        
        // Insert copied documents
        const insertedDocs = await Document.insertMany(clonedDocs);

        // Notify recipients of target organizations/departments
        for (const newDoc of insertedDocs) {
          let cloneRecipients = [];
          if (newDoc.status === 'FORWARDED' && newDoc.receiver.department) {
            // Ban hành nội bộ -> Thông báo cho toàn bộ người trong phòng ban nhận
            const deptUsers = await User.find({ department: newDoc.receiver.department });
            cloneRecipients = deptUsers.map(u => u._id);
          } else if (newDoc.status === 'SENT') {
            // Ban hành ra ngoài -> Thông báo cho văn thư bên nhận
            const dispatchers = await User.find({ organization: newDoc.receiver.organization, role: 'DISPATCHER' });
            cloneRecipients = dispatchers.map(u => u._id);
          }

          if (cloneRecipients.length > 0) {
            await Notification.insertMany(cloneRecipients.map(recipientId => ({
              recipient: recipientId,
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
    .populate('issuingOrganizations', 'name')
    .populate({
      path: 'feedbacks.user',
      select: 'name role department organization',
      populate: [
        { path: 'department', select: 'name' },
        { path: 'organization', select: 'name' }
      ]
    });

  if (document) {
    res.json(document);
  } else {
    res.status(404);
    throw new Error('Document not found');
  }
});

// @desc    Delete a document (Recall unread document)
// @route   DELETE /api/documents/:id
const deleteDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);

  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Check if the user is the sender
  if (document.sender.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Bạn không có quyền xóa văn bản này vì bạn không phải người gửi');
  }

  // Only allow recall if the status is still unread/unprocessed by receiver
  if (document.status !== 'FORWARDED' && document.status !== 'SENT' && document.status !== 'DRAFT') {
    res.status(400);
    throw new Error('Không thể thu hồi văn bản vì người nhận đã xử lý hoặc tiếp nhận.');
  }

  await document.deleteOne();
  
  // Also delete associated notifications
  await Notification.deleteMany({ document: req.params.id });

  res.json({ message: 'Đã xóa văn bản thành công' });
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
    // Lãnh đạo tổ chức thấy toàn bộ (bao gồm cả dự thảo)
  } else if (role === 'EMPLOYEE') {
    if (depId) {
      baseInQuery.$or = [
        { 'receiver.department': depId, 'receiver.targetEmployee': null },
        { 'receiver.department': depId, 'receiver.targetEmployee': { $exists: false } },
        { 'receiver.targetEmployee': userId }
      ];
    } else {
      baseInQuery['receiver.targetEmployee'] = userId;
    }
  }

  // Điều kiện STATUS của Incoming giống y hệt getDocuments
  baseInQuery.status = { $in: (role === 'DISPATCHER') ? ['SENT', 'FORWARDED', 'RECEIVED', 'PROCESSED'] : ['FORWARDED', 'RECEIVED', 'REJECTED', 'PROCESSED'] };
  baseInQuery['sender.user'] = { $ne: userId };

  // Xây dựng điều kiện ĐI (Outgoing) = tất cả văn bản do người dùng gửi
  let baseOutQuery = { 'sender.organization': orgId };
  if (role === 'LEADER') {
    if (leaderLevel === 'ORGANIZATION') {
      baseOutQuery.$or = [
        { 'sender.user': userId },
        { $expr: { $ne: ['$sender.organization', '$receiver.organization'] } },
        { type: 'DRAFT_PUBLISH', signer: userId }
      ];
    } else {
      baseOutQuery.$or = [
        { 'sender.user': userId },
        { type: 'DRAFT_PUBLISH', signer: userId }
      ];
    }
  } else if (role === 'DISPATCHER' || role === 'ADMIN') {
    // Đối với Văn thư: văn bản đi công ty khác + tất cả dự thảo văn bản
    baseOutQuery.$or = [
      {
        $expr: { $ne: ['$sender.organization', '$receiver.organization'] },
        type: { $ne: 'DRAFT_PUBLISH' }
      },
      {
        type: 'DRAFT_PUBLISH',
        'sender.organization': orgId
      }
    ];
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


// @desc    Get latest feedbacks for dashboard
// @route   GET /api/documents/feedbacks/latest
const getLatestFeedbacks = asyncHandler(async (req, res) => {
  const orgId = req.user.organization;
  const role = req.user.role;
  const userId = req.user._id;

  let query = {};
  if (role !== 'SUPER_ADMIN') {
    query = { 
      $or: [
        { 'sender.organization': orgId },
        { 'receiver.organization': orgId }
      ]
    };
  }

  const documents = await Document.find(query)
    .populate('feedbacks.user', 'name')
    .sort({ updatedAt: -1 })
    .limit(50); // Get recent documents to extract feedbacks

  let allFeedbacks = [];
  documents.forEach(doc => {
    doc.feedbacks.forEach(fb => {
      allFeedbacks.push({
        _id: fb._id,
        userName: fb.user?.name || 'Người dùng',
        createdAt: fb.createdAt,
        documentTitle: doc.title,
        documentId: doc._id,
        summary: fb.summary,
        content: fb.content
      });
    });
  });

  // Sort by date and take latest 10
  allFeedbacks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(allFeedbacks.slice(0, 10));
});

// @desc    Add feedback to document
// @route   POST /api/documents/:id/feedback
const addFeedbackToDocument = asyncHandler(async (req, res) => {
  const { summary, content, category } = req.body;

  const document = await Document.findById(req.params.id);

  if (document) {
    const attachments = req.files ? req.files.map(file => ({
      name: file.originalname,
      path: file.path.replace(/\\/g, '/'),
      size: file.size,
      mimetype: file.mimetype
    })) : [];

    const feedback = {
      user: req.user._id,
      summary,
      content,
      category: category || 'Công văn',
      attachments
    };

    document.feedbacks.push(feedback);

    document.history.push({
      user: req.user._id,
      action: 'FEEDBACK_ADDED',
      note: 'Đã thêm phản hồi',
    });

    await document.save();
    
    // Nếu đây là bản sao (isPublishedCopy), cũng cập nhật feedback lên văn bản gốc
    // để bên lãnh đạo/người gửi gốc cũng thấy được phản hồi từ bên nhận
    if (document.isPublishedCopy) {
      try {
        // Tìm văn bản gốc: cùng title, cùng documentNumber, cùng type DRAFT_PUBLISH,
        // cùng issuingOrganizations, nhưng KHÔNG phải bản sao
        const originalDoc = await Document.findOne({
          title: document.title,
          documentNumber: document.documentNumber,
          type: 'DRAFT_PUBLISH',
          isPublishedCopy: { $ne: true },
          issuingOrganizations: { $in: document.issuingOrganizations },
        });

        if (originalDoc) {
          originalDoc.feedbacks.push(feedback);
          originalDoc.history.push({
            user: req.user._id,
            action: 'FEEDBACK_ADDED',
            note: `Phản hồi từ bên nhận: ${req.user.name}`,
          });
          await originalDoc.save();
        }
      } catch (err) {
        console.error('Lỗi khi đồng bộ phản hồi về văn bản gốc:', err);
      }
    }
    
    // -- Create notifications --
    const recipients = new Set();
    
    // 1. Notify the sender
    if (document.sender.user.toString() !== req.user._id.toString()) {
      recipients.add(document.sender.user.toString());
    }

    // 2. Notify the signer (if it's a draft publish)
    if (document.signer && document.signer.toString() !== req.user._id.toString()) {
      recipients.add(document.signer.toString());
    }

    // 3. Notify the current receiver (if it's a person)
    if (document.receiver.targetLeader && document.receiver.targetLeader.toString() !== req.user._id.toString()) {
      recipients.add(document.receiver.targetLeader.toString());
    }
    if (document.receiver.targetEmployee && document.receiver.targetEmployee.toString() !== req.user._id.toString()) {
      recipients.add(document.receiver.targetEmployee.toString());
    }

    for (const recipientId of recipients) {
      await Notification.create({
        recipient: recipientId,
        document: document._id,
        message: `Có phản hồi mới từ ${req.user.name} về văn bản: ${document.title}`,
        type: 'NEW_FEEDBACK'
      });
    }

    res.status(201).json({ message: 'Phản hồi thành công', document });
  } else {
    res.status(404);
    throw new Error('Document not found');
  }
});

export { 
  createDocument,
  getDocuments,
  updateDocumentStatus,
  getDocumentById,
  getOrgStats,
  deleteDocument,
  addFeedbackToDocument,
  getLatestFeedbacks,
};
