import { FieldValue } from "firebase-admin/firestore";
import { BadRequest, NotFound } from "@/lib/api/response";
import { adminDb } from "@/lib/firestore/db";
import { generateJson } from "@/lib/services/gemini";
import { enforceDailyActionLimit } from "@/lib/services/rate-limit";
import type { AppUser } from "@/types";
import {
  WRITING_DIFFICULTIES,
  WRITING_PARTS,
  WRITING_PROMPT_STATUSES,
  type WritingAdminOverview,
  type WritingAttempt,
  type WritingAttemptInput,
  type WritingDeterministicCheck,
  type WritingDeterministicChecks,
  type WritingDifficulty,
  type WritingEmailBrief,
  type WritingFeedback,
  type WritingFeedbackCriterion,
  type WritingFeedbackIssue,
  type WritingGradingTargets,
  type WritingHint,
  type WritingPart,
  type WritingPrompt,
  type WritingPromptCatalog,
  type WritingPromptInput,
  type WritingPromptRecord,
  type WritingPromptStatus,
  type WritingPromptUpdateInput,
  type WritingResponseRules,
  type WritingRubricCriterion,
  type WritingSampleAnswer,
} from "@/types/writing";

const PROMPTS_COLLECTION = "writingPrompts";
const ATTEMPTS_COLLECTION = "writingAttempts";
const CONTENT_AUDIT_COLLECTION = "contentAuditLogs";
const MAX_RESPONSE_CHARACTERS = 8_000;
const MAX_HISTORY_ITEMS = 30;
const ATTEMPTS_PER_DAY = 25;
const ESTIMATE_DISCLAIMER =
  "Điểm này là ước tính phục vụ luyện tập, dựa trên bài viết hiện tại và không phải điểm TOEIC chính thức của ETS.";

const PART_RUBRICS: Record<WritingPart, WritingRubricCriterion[]> = {
  1: [
    {
      id: "languageControl",
      label: "Ngữ pháp và chính tả",
      maxScore: 1,
      description: "Câu rõ nghĩa, dùng cấu trúc và chính tả phù hợp.",
    },
    {
      id: "requiredTerms",
      label: "Dùng từ khóa bắt buộc",
      maxScore: 1,
      description: "Dùng cả hai từ hoặc cụm từ được yêu cầu trong một câu.",
    },
    {
      id: "relevance",
      label: "Liên quan tới ảnh",
      maxScore: 1,
      description: "Mô tả đúng hành động hoặc bối cảnh chính của ảnh.",
    },
  ],
  2: [
    {
      id: "taskResponse",
      label: "Hoàn thành yêu cầu",
      maxScore: 2,
      description: "Trả lời các ý chính trong email bằng thông tin hữu ích.",
    },
    {
      id: "toneOrganization",
      label: "Giọng điệu và bố cục",
      maxScore: 1,
      description: "Dùng giọng điệu lịch sự, dễ theo dõi, phù hợp thư công việc.",
    },
    {
      id: "languageControl",
      label: "Ngôn ngữ",
      maxScore: 1,
      description: "Ngữ pháp và từ vựng đủ rõ để người nhận hành động.",
    },
  ],
  3: [
    {
      id: "organization",
      label: "Tổ chức bài viết",
      maxScore: 2,
      description: "Có mở bài, các ý phát triển hợp lý và kết luận rõ ràng.",
    },
    {
      id: "development",
      label: "Phát triển ý",
      maxScore: 1,
      description: "Có lý do, ví dụ hoặc giải thích cụ thể để bảo vệ quan điểm.",
    },
    {
      id: "languageControl",
      label: "Ngôn ngữ",
      maxScore: 1,
      description: "Dùng câu và từ vựng rõ ràng, phù hợp văn phong học thuật nhẹ.",
    },
    {
      id: "taskResponse",
      label: "Trả lời đúng đề",
      maxScore: 1,
      description: "Nêu và duy trì quan điểm trực tiếp với câu hỏi.",
    },
  ],
};

const DEFAULT_RULES: Record<WritingPart, WritingResponseRules> = {
  1: { minWords: 5, recommendedWords: 12, maxWords: 40, minSentences: 1, maxSentences: 1 },
  2: { minWords: 60, recommendedWords: 100, maxWords: 300, minSentences: 3 },
  3: { minWords: 120, recommendedWords: 300, maxWords: 900, minSentences: 8 },
};

const DEFAULT_TIMES: Record<WritingPart, number> = { 1: 8, 2: 10, 3: 30 };

/**
 * Curated, original seed library. Text, prompts, samples, and image briefs
 * are authored for EnglishGo. Image paths point to original assets shipped in
 * /public/writing; they are not copied TOEIC or third-party test material.
 */
export const SEED_WRITING_PROMPTS: WritingPromptRecord[] = [
  createSeed({
    id: "p1-meeting-preparation",
    orderIndex: 10,
    part: 1,
    title: "Preparing a meeting room",
    titleVi: "Chuẩn bị phòng họp",
    summary: "Viết một câu mô tả hoạt động chuẩn bị trước buổi thuyết trình.",
    promptText: "Write ONE sentence based on the picture. Use BOTH words or phrases below. You may change their forms and use them in any order.",
    imageUrl: "/writing/meeting-preparation.png",
    imageAlt: "A colleague arranging materials in a meeting room before a presentation.",
    requiredTerms: ["prepare", "presentation"],
    tags: ["office", "meeting", "present continuous"],
    difficulty: "BEGINNER",
    taskChecklist: ["Viết đúng một câu hoàn chỉnh.", "Dùng cả prepare và presentation.", "Mô tả hành động nhìn thấy trong ảnh."],
    hints: [
      { level: 1, title: "Nhìn hành động chính", body: "Chủ thể đang sắp xếp tài liệu và màn hình trong phòng họp." },
      { level: 2, title: "Khung câu", body: "The employee is + V-ing + ... for the presentation." },
    ],
    sampleAnswers: [
      { answer: "The employee is preparing the meeting room for a presentation.", translationVi: "Nhân viên đang chuẩn bị phòng họp cho một buổi thuyết trình.", notes: "S + is + V-ing + O + for + noun." },
      { answer: "A woman preparing for a presentation is arranging materials on the conference table.", translationVi: "Một phụ nữ đang chuẩn bị cho bài thuyết trình đang sắp xếp tài liệu trên bàn họp.", notes: "Dùng cụm V-ing để bổ nghĩa chủ ngữ." },
    ],
    planTemplate: ["Who is in the picture?", "What is the person doing?", "Where or why is the action happening?"],
    gradingTargets: { topicKeywords: ["meeting", "room", "table", "materials", "arranging"], requiredIdeas: ["prepare a meeting space", "presentation"] },
  }),
  createSeed({
    id: "p1-restaurant-service",
    orderIndex: 20,
    part: 1,
    title: "Serving a customer",
    titleVi: "Phục vụ khách hàng",
    summary: "Viết một câu về nhân viên nhà hàng và thực đơn.",
    promptText: "Write ONE sentence based on the picture. Use BOTH words or phrases below. You may change their forms and use them in any order.",
    imageUrl: "/writing/restaurant-service.png",
    imageAlt: "A restaurant server speaking with a customer while holding a menu.",
    requiredTerms: ["serve", "menu"],
    tags: ["restaurant", "customer service", "present continuous"],
    difficulty: "BEGINNER",
    taskChecklist: ["Viết đúng một câu hoàn chỉnh.", "Dùng cả serve và menu.", "Nêu được hoạt động phục vụ trong nhà hàng."],
    hints: [
      { level: 1, title: "Tìm vai trò", body: "Có một nhân viên phục vụ đang tương tác với khách tại bàn." },
      { level: 2, title: "Khung câu", body: "The server is serving ... while showing ..." },
    ],
    sampleAnswers: [
      { answer: "The server is serving a customer while showing her the menu.", translationVi: "Nhân viên phục vụ đang phục vụ một khách hàng trong khi cho cô ấy xem thực đơn.", notes: "while nối hai hành động đang diễn ra." },
      { answer: "A waiter holding a menu is serving a customer at a restaurant table.", translationVi: "Một bồi bàn cầm thực đơn đang phục vụ khách hàng tại bàn trong nhà hàng.", notes: "Cụm V-ing có thể bổ nghĩa cho chủ ngữ." },
    ],
    planTemplate: ["Identify the server and customer.", "Choose the action with serve.", "Add the menu naturally."],
    gradingTargets: { topicKeywords: ["restaurant", "waiter", "server", "customer", "table"], requiredIdeas: ["serve customer", "menu"] },
  }),
  createSeed({
    id: "p1-delivery-packages",
    orderIndex: 30,
    part: 1,
    title: "Loading delivery packages",
    titleVi: "Chất kiện hàng giao nhận",
    summary: "Viết một câu mô tả nhân viên giao nhận và các kiện hàng.",
    promptText: "Write ONE sentence based on the picture. Use BOTH words or phrases below. You may change their forms and use them in any order.",
    imageUrl: "/writing/delivery-packages.png",
    imageAlt: "A delivery worker loading packages into a van outside an office building.",
    requiredTerms: ["deliver", "package"],
    tags: ["logistics", "delivery", "present continuous"],
    difficulty: "BEGINNER",
    taskChecklist: ["Viết đúng một câu hoàn chỉnh.", "Dùng cả deliver và package.", "Mô tả người giao nhận hoặc xe giao hàng."],
    hints: [
      { level: 1, title: "Hành động", body: "Nhân viên đang di chuyển các thùng hàng gần xe giao hàng." },
      { level: 2, title: "Khung câu", body: "The delivery worker is + V-ing + packages + ..." },
    ],
    sampleAnswers: [
      { answer: "The delivery worker is loading packages into a van to deliver them this afternoon.", translationVi: "Nhân viên giao hàng đang chất các kiện hàng vào xe để giao chúng vào chiều nay.", notes: "Dùng to + V để nói mục đích." },
      { answer: "Several packages are being delivered from a van outside the building.", translationVi: "Một số kiện hàng đang được giao từ một chiếc xe bên ngoài tòa nhà.", notes: "Câu bị động hiện tại tiếp diễn." },
    ],
    planTemplate: ["Name the delivery worker or packages.", "Describe the movement.", "Add the delivery purpose or location."],
    gradingTargets: { topicKeywords: ["van", "box", "loading", "worker", "building"], requiredIdeas: ["packages", "deliver"] },
  }),
  createSeed({
    id: "p1-airport-flight",
    orderIndex: 40,
    part: 1,
    title: "Checking a flight board",
    titleVi: "Kiểm tra bảng chuyến bay",
    summary: "Viết một câu về hành khách và thông tin chuyến bay.",
    promptText: "Write ONE sentence based on the picture. Use BOTH words or phrases below. You may change their forms and use them in any order.",
    imageUrl: "/writing/airport-flight.png",
    imageAlt: "A traveler with luggage looking up at an airport flight information board.",
    requiredTerms: ["wait", "flight"],
    tags: ["travel", "airport", "present continuous"],
    difficulty: "BEGINNER",
    taskChecklist: ["Viết đúng một câu hoàn chỉnh.", "Dùng cả wait và flight.", "Nêu bối cảnh sân bay hoặc bảng thông tin."],
    hints: [
      { level: 1, title: "Bối cảnh", body: "Hành khách đang ở sân bay và nhìn lên bảng thông tin." },
      { level: 2, title: "Khung câu", body: "The traveler is waiting for a flight while ..." },
    ],
    sampleAnswers: [
      { answer: "The traveler is waiting for his flight while checking the departure board.", translationVi: "Hành khách đang chờ chuyến bay trong khi kiểm tra bảng khởi hành.", notes: "while + V-ing diễn tả hành động đồng thời." },
      { answer: "A passenger waiting for a flight is looking at the airport information board.", translationVi: "Một hành khách đang chờ chuyến bay đang nhìn vào bảng thông tin sân bay.", notes: "Cụm waiting for a flight bổ nghĩa cho passenger." },
    ],
    planTemplate: ["Name the traveler.", "Use wait for a flight.", "Add the departure board or airport."],
    gradingTargets: { topicKeywords: ["airport", "traveler", "passenger", "board", "luggage"], requiredIdeas: ["wait", "flight"] },
  }),
  createSeed({
    id: "p1-office-report",
    orderIndex: 50,
    part: 1,
    title: "Reviewing a report",
    titleVi: "Rà soát báo cáo",
    summary: "Viết một câu về việc kiểm tra báo cáo trong văn phòng.",
    promptText: "Write ONE sentence based on the picture. Use BOTH words or phrases below. You may change their forms and use them in any order.",
    imageUrl: "/writing/office-report.png",
    imageAlt: "An office employee reading a printed report at a desk with a laptop.",
    requiredTerms: ["review", "report"],
    tags: ["office", "documents", "present continuous"],
    difficulty: "BEGINNER",
    taskChecklist: ["Viết đúng một câu hoàn chỉnh.", "Dùng cả review và report.", "Mô tả hành động làm việc tại bàn."],
    hints: [
      { level: 1, title: "Hành động chính", body: "Nhân viên đang đọc tài liệu bên cạnh máy tính xách tay." },
      { level: 2, title: "Khung câu", body: "The employee is reviewing a report at ..." },
    ],
    sampleAnswers: [
      { answer: "The employee is reviewing a report at her desk before the afternoon meeting.", translationVi: "Nhân viên đang rà soát một báo cáo tại bàn làm việc trước cuộc họp buổi chiều.", notes: "at her desk chỉ địa điểm làm việc." },
      { answer: "A woman is reviewing the sales report on her desk next to a laptop.", translationVi: "Một phụ nữ đang xem lại báo cáo doanh số trên bàn bên cạnh máy tính xách tay.", notes: "next to dùng để chỉ vị trí." },
    ],
    planTemplate: ["Identify the employee.", "Use review + report.", "Add the desk, laptop, or meeting context."],
    gradingTargets: { topicKeywords: ["desk", "laptop", "document", "office", "reading"], requiredIdeas: ["review", "report"] },
  }),
  createSeed({
    id: "p2-delayed-delivery",
    orderIndex: 110,
    part: 2,
    title: "Delayed delivery update",
    titleVi: "Cập nhật đơn giao bị chậm",
    summary: "Viết email lịch sự để trấn an khách hàng về đơn giao trễ.",
    promptText: "Write an email response to the customer. Explain the delay, give a realistic next step, and offer appropriate support.",
    tags: ["email", "customer service", "apology"],
    difficulty: "INTERMEDIATE",
    email: {
      fromName: "Linh Tran",
      toName: "Customer Support",
      subject: "Order 4837 has not arrived",
      body: "Hello,\n\nMy order was due yesterday, but the tracking page has not changed for two days. Could you tell me when it will arrive?\n\nThank you,",
      signature: "Daniel Ortiz",
    },
    taskChecklist: ["Xin lỗi ngắn gọn về sự chậm trễ.", "Giải thích tình trạng đơn theo cách không bịa chắc chắn.", "Nêu mốc hoặc bước tiếp theo cụ thể.", "Đưa ra một cách hỗ trợ nếu đơn tiếp tục chậm."],
    hints: [
      { level: 1, title: "Bố cục email", body: "Mở đầu lịch sự → xin lỗi → cập nhật → bước tiếp theo → kết thư." },
      { level: 2, title: "Cụm hữu ích", body: "I am sorry for the delay. / We are checking with the carrier. / We will update you by ..." },
    ],
    sampleAnswers: [
      { answer: "Dear Mr. Ortiz,\n\nI am sorry that your order has not arrived as expected. The tracking information shows that the package is still being processed by the carrier, and we are contacting them for an update. We will email you by tomorrow afternoon with a confirmed delivery date. If the package cannot be delivered this week, we can arrange a replacement or a refund.\n\nKind regards,\nLinh Tran", translationVi: "Kính gửi ông Ortiz,\n\nTôi xin lỗi vì đơn hàng của ông chưa đến như dự kiến...", notes: "Không khẳng định nguyên nhân khi chưa có dữ liệu; nêu hành động và mốc cập nhật." },
    ],
    planTemplate: ["Greet the customer by name.", "Apologize and acknowledge the problem.", "Give a careful status update.", "Promise one concrete follow-up.", "Offer a reasonable support option and close politely."],
    gradingTargets: { topicKeywords: ["order", "delivery", "tracking", "carrier", "package"], requiredIdeas: ["apology", "status update", "next step", "support option"] },
  }),
  createSeed({
    id: "p2-training-room-request",
    orderIndex: 120,
    part: 2,
    title: "Training room request",
    titleVi: "Yêu cầu phòng đào tạo",
    summary: "Viết email trả lời yêu cầu đặt phòng cho buổi đào tạo nội bộ.",
    promptText: "Write an email response. Confirm what is available, ask for any missing information, and explain the booking next step.",
    tags: ["email", "office", "scheduling"],
    difficulty: "INTERMEDIATE",
    email: {
      fromName: "Nora Kim",
      toName: "Facilities Team",
      subject: "Room request for new-staff training",
      body: "Hi,\n\nCould we reserve a room for a new-staff training session next Wednesday? We expect about 18 people and need a screen for slides. The session will run from 9:30 a.m. to noon.\n\nBest,",
      signature: "Nora",
    },
    taskChecklist: ["Xác nhận phòng hoặc thiết bị đang có.", "Hỏi một thông tin còn thiếu hợp lý.", "Nêu cách hoàn tất đặt phòng.", "Dùng giọng điệu chuyên nghiệp."],
    hints: [
      { level: 1, title: "Thông tin có sẵn", body: "Ngày, giờ, số người và màn hình đã được nêu. Hãy nghĩ xem còn gì cần xác nhận." },
      { level: 2, title: "Cụm hữu ích", body: "Room B is available... / Could you please confirm... / I will hold the room once..." },
    ],
    sampleAnswers: [
      { answer: "Hi Nora,\n\nRoom B is available next Wednesday from 9:30 a.m. to noon, and it has a screen for your slides. Could you please confirm whether you need a video-conference connection as well? Once I receive your confirmation, I will place the room on the training calendar and send you the booking details.\n\nBest regards,\nFacilities Team", translationVi: "Chào Nora,\n\nPhòng B còn trống vào thứ Tư tới...", notes: "Trả lời đủ yêu cầu, đồng thời chỉ hỏi một thông tin thực sự còn thiếu." },
    ],
    planTemplate: ["Acknowledge the request.", "Confirm the room and screen.", "Ask one missing question.", "Explain what will happen after confirmation."],
    gradingTargets: { topicKeywords: ["room", "training", "screen", "Wednesday", "booking"], requiredIdeas: ["availability", "missing information", "booking next step"] },
  }),
  createSeed({
    id: "p2-event-feedback",
    orderIndex: 130,
    part: 2,
    title: "Workshop feedback follow-up",
    titleVi: "Phản hồi sau buổi workshop",
    summary: "Viết email cảm ơn và xử lý một góp ý của người tham dự.",
    promptText: "Write an email response. Thank the participant, address the concern, and explain one improvement for the next workshop.",
    tags: ["email", "feedback", "events"],
    difficulty: "INTERMEDIATE",
    email: {
      fromName: "Maya Lewis",
      toName: "Events Team",
      subject: "Feedback on Friday's workshop",
      body: "Hello,\n\nThe workshop was useful, especially the product demonstration. However, the question-and-answer session was too short, and several attendees could not ask their questions.\n\nSincerely,",
      signature: "Maya Lewis",
    },
    taskChecklist: ["Cảm ơn người gửi phản hồi.", "Thừa nhận điểm cần cải thiện.", "Nêu một thay đổi cụ thể cho lần tới.", "Giữ giọng điệu tích cực."],
    hints: [
      { level: 1, title: "Phản hồi tốt", body: "Đừng phòng thủ. Hãy công nhận góp ý và nói rõ hành động sẽ làm." },
      { level: 2, title: "Cụm hữu ích", body: "Thank you for taking the time... / We understand your concern... / For the next session, we will..." },
    ],
    sampleAnswers: [
      { answer: "Dear Ms. Lewis,\n\nThank you for taking the time to share your feedback. We are pleased that you found the product demonstration useful, and we understand your concern about the short question-and-answer session. For our next workshop, we will reserve at least twenty additional minutes for questions and collect questions in advance.\n\nBest regards,\nEvents Team", translationVi: "Kính gửi bà Lewis,\n\nCảm ơn bà đã dành thời gian chia sẻ phản hồi...", notes: "Nhắc lại một điểm tích cực, xử lý vấn đề và cam kết thay đổi cụ thể." },
    ],
    planTemplate: ["Thank the participant.", "Recognize the concern without arguing.", "Describe one concrete improvement.", "Close on a constructive note."],
    gradingTargets: { topicKeywords: ["workshop", "feedback", "question", "session", "attendees"], requiredIdeas: ["thanks", "acknowledge concern", "improvement"] },
  }),
  createSeed({
    id: "p2-service-cancellation",
    orderIndex: 140,
    part: 2,
    title: "Subscription cancellation request",
    titleVi: "Yêu cầu hủy gói dịch vụ",
    summary: "Viết email phản hồi lịch sự về yêu cầu hủy dịch vụ.",
    promptText: "Write an email response. Confirm the request, state any important timing detail, and offer help without pressuring the customer to stay.",
    tags: ["email", "service", "customer support"],
    difficulty: "ADVANCED",
    email: {
      fromName: "Alex Nguyen",
      toName: "Account Services",
      subject: "Please cancel my monthly plan",
      body: "Hello,\n\nI would like to cancel my monthly plan because our team will not need the service after this month. Please let me know whether I need to do anything else.\n\nRegards,",
      signature: "Alex Nguyen",
    },
    taskChecklist: ["Xác nhận đã nhận yêu cầu.", "Giải thích ngày hiệu lực hoặc bước xác nhận hủy.", "Nêu cách truy cập dữ liệu còn lại nếu phù hợp.", "Đề nghị hỗ trợ trung lập, không gây áp lực."],
    hints: [
      { level: 1, title: "Tôn trọng lựa chọn", body: "Email tốt vẫn hữu ích ngay cả khi khách muốn rời đi." },
      { level: 2, title: "Cụm hữu ích", body: "Your plan will remain active until... / You can download... / Please let us know if you need assistance." },
    ],
    sampleAnswers: [
      { answer: "Dear Alex,\n\nWe have received your cancellation request. Your monthly plan will remain active until the end of the current billing period, and no further charges will be made after that date. If you would like to keep a copy of your team data, you can download it from the Account page before the plan ends. Please let us know if you need help with the final steps.\n\nKind regards,\nAccount Services", translationVi: "Kính gửi Alex,\n\nChúng tôi đã nhận yêu cầu hủy của bạn...", notes: "Xác nhận thời điểm, giải thích rõ và đưa hỗ trợ trung lập." },
    ],
    planTemplate: ["Confirm receipt of the cancellation request.", "State the cancellation timing clearly.", "Mention a practical next step for data or account access.", "Offer help without a sales pitch."],
    gradingTargets: { topicKeywords: ["cancel", "plan", "billing", "account", "data"], requiredIdeas: ["confirm request", "timing", "data or next step", "neutral support"] },
  }),
  createSeed({
    id: "p3-remote-work",
    orderIndex: 210,
    part: 3,
    title: "Remote work and teamwork",
    titleVi: "Làm việc từ xa và tinh thần đồng đội",
    summary: "Viết bài luận nêu quan điểm về tác động của làm việc từ xa.",
    promptText: "Do you agree or disagree with the following statement? Remote work makes teams more productive than working in the same office. Use specific reasons and examples to support your answer.",
    tags: ["essay", "workplace", "opinion"],
    difficulty: "ADVANCED",
    taskChecklist: ["Nêu rõ đồng ý, không đồng ý hoặc quan điểm cân bằng.", "Đưa ít nhất hai lý do có giải thích.", "Dùng ví dụ cụ thể từ công việc hoặc tình huống thực tế.", "Kết luận nhất quán với quan điểm."],
    hints: [
      { level: 1, title: "Chọn lập trường", body: "Bạn có thể đồng ý có điều kiện; điều quan trọng là giữ lập trường nhất quán." },
      { level: 2, title: "Khung 4 đoạn", body: "Mở bài nêu quan điểm → lý do 1 + ví dụ → lý do 2 + ví dụ → kết luận." },
    ],
    sampleAnswers: [
      { answer: "I agree that remote work can make many teams more productive, although it is not suitable for every task. First, employees often save commuting time and can use that time to begin focused work earlier. For example, a software team may schedule uninterrupted morning work before joining an online meeting in the afternoon. Second, remote tools make it easier to document decisions, which can reduce repeated discussions. However, teams still need regular video meetings and occasional in-person sessions to maintain trust. Overall, remote work improves productivity when a team sets clear goals and communicates consistently.", translationVi: "Tôi đồng ý rằng làm việc từ xa có thể giúp nhiều nhóm làm việc hiệu quả hơn...", notes: "Bài mẫu minh họa cấu trúc và cách phát triển ý; hãy dùng ví dụ của riêng bạn khi luyện tập." },
    ],
    planTemplate: ["State your position in one or two sentences.", "Reason 1: explain it and add a concrete example.", "Reason 2: explain it and add a concrete example.", "Acknowledge one limitation if useful.", "Restate your position in the conclusion."],
    gradingTargets: { topicKeywords: ["remote", "work", "team", "productive", "office"], requiredIdeas: ["clear position", "reason", "example", "conclusion"] },
  }),
  createSeed({
    id: "p3-green-commute",
    orderIndex: 220,
    part: 3,
    title: "Greener commuting choices",
    titleVi: "Lựa chọn đi lại xanh hơn",
    summary: "Viết bài luận về vai trò của công ty trong việc hỗ trợ đi lại thân thiện môi trường.",
    promptText: "Some people believe employers should encourage workers to use environmentally friendly transportation. Do you agree or disagree? Use specific reasons and examples to support your answer.",
    tags: ["essay", "environment", "workplace"],
    difficulty: "ADVANCED",
    taskChecklist: ["Nêu lập trường rõ ràng.", "Giải thích lợi ích hoặc hạn chế thực tế.", "Đưa ví dụ về chính sách công ty hoặc trải nghiệm đi lại.", "Tổ chức thành bài luận dễ theo dõi."],
    hints: [
      { level: 1, title: "Đừng chỉ nói về môi trường", body: "Bạn có thể thêm lợi ích về chi phí, sức khỏe, bãi đỗ xe hoặc tuyển dụng." },
      { level: 2, title: "Mở rộng ví dụ", body: "Ví dụ: trợ giá vé xe buýt, chỗ để xe đạp, xe đưa đón hoặc giờ làm linh hoạt." },
    ],
    sampleAnswers: [
      { answer: "I agree that employers should encourage environmentally friendly transportation because commuting policies can improve both local communities and employee well-being. A company that subsidizes public transit, for example, can make buses or trains affordable for workers who would otherwise drive alone. This can reduce parking pressure around the office and lower traffic during busy hours. Employers can also provide secure bicycle parking and flexible start times, which makes cycling or ride-sharing more practical. These programs should remain voluntary because some employees live far from public transportation. Nevertheless, even small incentives can help workers make greener choices without creating an unfair burden.", translationVi: "Tôi đồng ý rằng người sử dụng lao động nên khuyến khích phương tiện đi lại thân thiện môi trường...", notes: "Ví dụ cụ thể giúp bài luận thuyết phục hơn thay vì chỉ nêu khẩu hiệu." },
    ],
    planTemplate: ["Introduce your position.", "Explain the first practical benefit.", "Give a policy example.", "Explain a second benefit or limitation.", "Conclude with a balanced final sentence."],
    gradingTargets: { topicKeywords: ["employer", "transportation", "environment", "commute", "worker"], requiredIdeas: ["position", "reason", "example", "conclusion"] },
  }),
  createSeed({
    id: "p3-customer-reviews",
    orderIndex: 230,
    part: 3,
    title: "Customer reviews and trust",
    titleVi: "Đánh giá khách hàng và niềm tin",
    summary: "Viết bài luận về việc doanh nghiệp có nên công khai mọi đánh giá của khách hàng.",
    promptText: "Do you agree or disagree with the following statement? Businesses should publish all customer reviews, including negative ones. Use specific reasons and examples to support your answer.",
    tags: ["essay", "business", "opinion"],
    difficulty: "ADVANCED",
    taskChecklist: ["Nêu lập trường và giải thích vì sao.", "Thảo luận niềm tin của khách hàng hoặc chất lượng dịch vụ.", "Đưa ví dụ thực tế hoặc giả định rõ ràng.", "Kết luận trực tiếp."],
    hints: [
      { level: 1, title: "Nhìn cả hai mặt", body: "Có thể công khai đánh giá tiêu cực nhưng cần kiểm duyệt nội dung giả mạo hoặc xúc phạm." },
      { level: 2, title: "Liên kết ý", body: "Use however, as a result, and for example to show the logic between paragraphs." },
    ],
    sampleAnswers: [
      { answer: "I agree that businesses should publish both positive and negative customer reviews, provided that they remove spam and abusive language. Honest negative reviews show that a company is not hiding problems, which can increase trust. They also help managers identify repeated issues. For example, if several customers complain that a delivery service is late, the company can investigate its shipping process instead of assuming everything is working well. Publishing only favorable comments may appear safer in the short term, but customers often notice when a review page looks unrealistic. Therefore, transparent reviews are valuable because they support better decisions for both customers and businesses.", translationVi: "Tôi đồng ý rằng doanh nghiệp nên công khai cả đánh giá tích cực lẫn tiêu cực...", notes: "Bài mẫu có điều kiện rõ ràng, lý do và ví dụ cụ thể." },
    ],
    planTemplate: ["State your answer and any condition.", "Explain how transparency affects trust.", "Give a concrete business example.", "Address a limitation such as spam.", "Conclude with your main point."],
    gradingTargets: { topicKeywords: ["business", "customer", "review", "negative", "trust"], requiredIdeas: ["position", "reason", "example", "conclusion"] },
  }),
  createSeed({
    id: "p3-training-budget",
    orderIndex: 240,
    part: 3,
    title: "Investing in staff training",
    titleVi: "Đầu tư vào đào tạo nhân viên",
    summary: "Viết bài luận về ưu tiên ngân sách đào tạo cho nhân viên.",
    promptText: "Some companies spend more money on technology than on employee training. Which investment is more important for a company's long-term success? Use specific reasons and examples to support your answer.",
    tags: ["essay", "business", "training"],
    difficulty: "ADVANCED",
    taskChecklist: ["Chọn ưu tiên chính và nêu lý do.", "So sánh hoặc thừa nhận vai trò của lựa chọn còn lại.", "Đưa ví dụ cụ thể về tác động dài hạn.", "Kết luận nhất quán."],
    hints: [
      { level: 1, title: "Không cần phủ nhận hoàn toàn", body: "Bạn có thể chọn đào tạo nhưng vẫn giải thích vì sao công nghệ cần đi cùng con người." },
      { level: 2, title: "Ví dụ tốt", body: "Nêu một hệ thống mới nhưng nhân viên chưa được đào tạo, hoặc một đội ngũ được đào tạo có thể dùng công cụ hiệu quả hơn." },
    ],
    sampleAnswers: [
      { answer: "For long-term success, I believe employee training is the more important investment, although technology is also necessary. A new system produces little value when employees do not understand how to use it or how it changes their daily work. Training helps staff adapt, solve problems, and share knowledge with colleagues. For example, a retailer may purchase advanced inventory software, but store managers will still make errors if they receive only a short demonstration. Well-trained managers can use the software to predict demand and reduce waste. Technology can improve efficiency, but skilled employees decide whether that technology actually improves the business. For this reason, companies should reserve a meaningful budget for continuous training.", translationVi: "Để thành công lâu dài, tôi cho rằng đào tạo nhân viên là khoản đầu tư quan trọng hơn...", notes: "Bài mẫu so sánh hai lựa chọn nhưng vẫn giữ ưu tiên rõ ràng." },
    ],
    planTemplate: ["Choose your main investment.", "Explain why it matters long term.", "Give a realistic company example.", "Acknowledge the value of the other investment.", "Conclude with the priority."],
    gradingTargets: { topicKeywords: ["company", "technology", "training", "employee", "investment"], requiredIdeas: ["choice", "reason", "example", "comparison", "conclusion"] },
  }),
];

/** List learner-visible prompts, using Firestore overrides when they exist. */
export async function listWritingPrompts(part?: WritingPart): Promise<WritingPromptCatalog> {
  const { records, source } = await readMergedPromptRecords();
  const items = records
    .filter((item) => item.status === "PUBLISHED")
    .filter((item) => part == null || item.part === part)
    .sort(sortPrompts)
    .map(toPublicPrompt);
  return { items, total: items.length, source };
}

/** Retrieve a public prompt. Archived, draft and review prompts are hidden. */
export async function getWritingPrompt(id: string): Promise<WritingPrompt> {
  const record = await findPromptRecord(id);
  if (!record || record.status !== "PUBLISHED") throw NotFound("Writing prompt not found");
  return toPublicPrompt(record);
}

/** Admin listing includes every status but still strips private grading targets. */
export async function listAdminWritingPrompts(): Promise<WritingPrompt[]> {
  const { records } = await readMergedPromptRecords();
  return records.sort(sortPrompts).map(toPublicPrompt);
}

export async function getWritingAdminOverview(): Promise<WritingAdminOverview> {
  const prompts = await listAdminWritingPrompts();
  const byPart: Record<WritingPart, number> = { 1: 0, 2: 0, 3: 0 };
  prompts.forEach((prompt) => { byPart[prompt.part] += 1; });
  return {
    total: prompts.length,
    published: prompts.filter((item) => item.status === "PUBLISHED").length,
    draft: prompts.filter((item) => item.status === "DRAFT").length,
    review: prompts.filter((item) => item.status === "REVIEW").length,
    archived: prompts.filter((item) => item.status === "ARCHIVED").length,
    byPart,
    lastUpdatedAtMillis: prompts.reduce<number | null>((latest, item) => {
      const current = item.updatedAtMillis ?? item.createdAtMillis;
      return current != null && (latest == null || current > latest) ? current : latest;
    }, null),
  };
}

/**
 * Copies only missing original seeds to Firestore. Existing documents are
 * deliberately preserved, so an admin's edits are never overwritten by a
 * deploy or a repeat click of the seed action.
 */
export async function seedDefaultWritingPrompts(uid: string): Promise<{ created: number; existing: number; total: number }> {
  const refs = SEED_WRITING_PROMPTS.map((prompt) => adminDb.collection(PROMPTS_COLLECTION).doc(prompt.id));
  const snapshots = await adminDb.getAll(...refs);
  const missing = SEED_WRITING_PROMPTS.filter((_, index) => !snapshots[index]?.exists);
  if (missing.length > 0) {
    const now = Date.now();
    const batch = adminDb.batch();
    missing.forEach((prompt) => {
      batch.set(adminDb.collection(PROMPTS_COLLECTION).doc(prompt.id), serializePrompt(prompt, {
        createdAtMillis: now,
        updatedAtMillis: now,
        createdByUid: uid,
        updatedByUid: uid,
      }));
    });
    await batch.commit();
  }
  await recordWritingAudit("SEED_DEFAULT_PROMPTS", "seed-library", uid, { created: missing.length });
  return { created: missing.length, existing: SEED_WRITING_PROMPTS.length - missing.length, total: SEED_WRITING_PROMPTS.length };
}

export async function createWritingPrompt(input: WritingPromptInput, uid: string): Promise<WritingPrompt> {
  const now = Date.now();
  const ref = adminDb.collection(PROMPTS_COLLECTION).doc();
  const record = buildPromptRecord(ref.id, input, now);
  await ref.set(serializePrompt(record, {
    createdAtMillis: now,
    updatedAtMillis: now,
    createdByUid: uid,
    updatedByUid: uid,
  }));
  await recordWritingAudit("CREATE_PROMPT", record.id, uid, { part: record.part });
  return toPublicPrompt(record);
}

export async function updateWritingPrompt(
  id: string,
  input: WritingPromptUpdateInput,
  uid: string,
): Promise<WritingPrompt> {
  const cleanPromptId = cleanId(id);
  const current = await findPromptRecord(cleanPromptId);
  if (!current) throw NotFound("Writing prompt not found");
  const now = Date.now();
  const record = buildPromptRecord(cleanPromptId, input, now, current);
  await adminDb.collection(PROMPTS_COLLECTION).doc(cleanPromptId).set(serializePrompt(record, {
    createdAtMillis: current.createdAtMillis ?? now,
    updatedAtMillis: now,
    updatedByUid: uid,
  }, false), { merge: true });
  await recordWritingAudit("UPDATE_PROMPT", cleanPromptId, uid, { part: record.part, status: record.status });
  return toPublicPrompt(record);
}

/** Grade, persist, and return one authenticated learner attempt. */
export async function submitWritingAttempt(user: AppUser | null, input: WritingAttemptInput): Promise<WritingAttempt> {
  if (!user) throw BadRequest("Bạn cần đăng nhập để lưu bài viết.");
  const promptId = cleanId(input.promptId);
  const prompt = await findPromptRecord(promptId);
  if (!prompt || prompt.status !== "PUBLISHED") throw NotFound("Writing prompt not found");

  const responseText = cleanResponse(input.responseText);
  if (!responseText) throw BadRequest("Hãy viết câu trả lời trước khi chấm điểm.");
  await enforceDailyActionLimit(user.uid, "writing-ai-grade", ATTEMPTS_PER_DAY);

  const deterministicChecks = buildDeterministicChecks(prompt, responseText);
  const feedback = await gradeWritingAttempt(prompt, responseText, deterministicChecks)
    .catch(() => buildFallbackFeedback(prompt, responseText, deterministicChecks));
  const now = Date.now();
  const elapsedSeconds = normalizeElapsedSeconds(input.elapsedSeconds);
  const usedHintLevels = normalizeHintLevels(input.usedHintLevels);
  const data = {
    promptId: prompt.id,
    promptPart: prompt.part,
    promptTitle: prompt.title,
    promptVersion: prompt.version,
    responseText,
    wordCount: deterministicChecks.wordCount,
    elapsedSeconds,
    usedHintLevels,
    usedSample: Boolean(input.usedSample),
    feedback,
    submittedAtMillis: now,
    createdAtMillis: now,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await adminDb.collection("users").doc(user.uid).collection(ATTEMPTS_COLLECTION).add(data);
  return { id: ref.id, ...data };
}

export async function listWritingAttemptHistory(
  uid: string,
  options: { part?: WritingPart; limit?: number } = {},
): Promise<WritingAttempt[]> {
  const limit = normalizeHistoryLimit(options.limit);
  // Avoid a composite Firestore index requirement for the optional part
  // filter. The learner history is intentionally small and private, so a
  // bounded in-memory filter is safer than failing a first-time deployment.
  const query: FirebaseFirestore.Query = adminDb
    .collection("users")
    .doc(uid)
    .collection(ATTEMPTS_COLLECTION);
  const snapshot = await query.orderBy("submittedAtMillis", "desc").limit(options.part == null ? limit : 120).get();
  return snapshot.docs
    .map((doc) => toAttempt(doc.id, recordValue(doc.data())))
    .filter((item): item is WritingAttempt => item !== null)
    .filter((item) => options.part == null || item.promptPart === options.part)
    .slice(0, limit);
}

/** Exposed for focused unit tests and transparent fallback diagnostics. */
export function evaluateWritingDeterministically(prompt: WritingPromptRecord, responseText: string): WritingDeterministicChecks {
  return buildDeterministicChecks(prompt, cleanResponse(responseText));
}

async function gradeWritingAttempt(
  prompt: WritingPromptRecord,
  responseText: string,
  deterministicChecks: WritingDeterministicChecks,
): Promise<WritingFeedback> {
  const fallback = buildFallbackFeedback(prompt, responseText, deterministicChecks);
  const result = await generateJson(buildGeminiPrompt(prompt, responseText, deterministicChecks));
  const normalized = normalizeGeminiFeedback(result, prompt, fallback);
  return normalized;
}

function buildGeminiPrompt(
  prompt: WritingPromptRecord,
  responseText: string,
  checks: WritingDeterministicChecks,
): string {
  const rubric = prompt.rubric.map((item) => ({ id: item.id, label: item.label, maxScore: item.maxScore, description: item.description }));
  return `You are a careful TOEIC Writing practice coach for Vietnamese learners. This is educational feedback only, never an official ETS score.

Grade the learner response for the ORIGINAL EnglishGo writing prompt below. Give concrete, supportive feedback in Vietnamese. Do not claim to inspect an image beyond the supplied scene description. Do not invent grammar errors. If a sentence is acceptable, say so briefly.

Part: ${prompt.part}
Title: ${prompt.title}
Instructions: ${prompt.instructions}
Task: ${prompt.promptText}
Required terms: ${JSON.stringify(prompt.requiredTerms)}
Checklist: ${JSON.stringify(prompt.taskChecklist)}
Expected topical signals: ${JSON.stringify(prompt.gradingTargets.topicKeywords)}
Expected ideas: ${JSON.stringify(prompt.gradingTargets.requiredIdeas)}
Response rules: ${JSON.stringify(prompt.responseRules)}
Rubric: ${JSON.stringify(rubric)}
Deterministic checks already measured: ${JSON.stringify(checks)}

Learner response:
"""${responseText}"""

Return one JSON object only with this exact shape:
{
  "summary": "one concise Vietnamese summary",
  "criteria": [{"id":"rubric id", "score": 0, "feedback":"concise Vietnamese feedback"}],
  "strengths": ["up to 3 concise Vietnamese strengths"],
  "issues": [{"title":"short Vietnamese issue title", "explanation":"what to improve", "correction":"optional correction or null", "example":"optional short English example or null"}],
  "revisedAnswer": "a better English response that still answers the same task, or null",
  "nextAction": "one actionable Vietnamese next step"
}

Scores must be whole numbers no higher than each criterion maximum. Keep revisedAnswer within the prompt's response rules and do not copy a sample answer verbatim.`;
}

function normalizeGeminiFeedback(
  value: unknown,
  prompt: WritingPromptRecord,
  fallback: WritingFeedback,
): WritingFeedback {
  const data = recordValue(value);
  const rawCriteria = arrayValue(data.criteria).map(recordValue);
  const criteria = prompt.rubric.map((criterion, index) => {
    const candidate = rawCriteria.find((item) => stringValue(item.id) === criterion.id);
    const fallbackCriterion = fallback.criteria[index];
    return {
      ...criterion,
      score: clampInteger(numberValue(candidate?.score) ?? fallbackCriterion.score, 0, criterion.maxScore),
      feedback: cleanShortText(candidate?.feedback, 500) || fallbackCriterion.feedback,
    } satisfies WritingFeedbackCriterion;
  });
  const strengths = stringArray(data.strengths, 3, 240);
  const issues = arrayValue(data.issues)
    .map((item) => toFeedbackIssue(recordValue(item)))
    .filter((item): item is WritingFeedbackIssue => item !== null)
    .slice(0, 4);
  const score = criteria.reduce((sum, item) => sum + item.score, 0);
  return {
    isEstimate: true,
    disclaimer: ESTIMATE_DISCLAIMER,
    providerStatus: "GEMINI",
    score,
    maxScore: maxScoreFor(prompt.part),
    summary: cleanShortText(data.summary, 700) || fallback.summary,
    criteria,
    deterministicChecks: fallback.deterministicChecks,
    strengths: strengths.length ? strengths : fallback.strengths,
    issues: issues.length ? issues : fallback.issues,
    revisedAnswer: cleanOptionalText(data.revisedAnswer, 3_000),
    nextAction: cleanShortText(data.nextAction, 500) || fallback.nextAction,
  };
}

function buildFallbackFeedback(
  prompt: WritingPromptRecord,
  responseText: string,
  checks: WritingDeterministicChecks,
): WritingFeedback {
  const criteria = fallbackCriteria(prompt, responseText, checks);
  const score = criteria.reduce((sum, item) => sum + item.score, 0);
  const missingTerms = checks.requiredTerms.filter((item) => !item.found).map((item) => item.term);
  const failedRules = checks.checks.filter((item) => !item.passed);
  const strengths: string[] = [];
  if (checks.wordCount > 0) strengths.push("Bạn đã gửi một câu trả lời để tiếp tục luyện tập.");
  if (missingTerms.length === 0 && prompt.requiredTerms.length > 0) strengths.push("Bạn đã dùng đủ từ khóa bắt buộc.");
  if (checks.checks.some((item) => item.id === "length" && item.passed)) strengths.push("Độ dài bài viết nằm trong phạm vi luyện tập gợi ý.");
  if (strengths.length === 0) strengths.push("Hãy bắt đầu bằng một câu hoặc ý chính rõ ràng.");

  const issues: WritingFeedbackIssue[] = [];
  if (missingTerms.length > 0) {
    issues.push({
      title: "Thiếu từ khóa bắt buộc",
      explanation: `Bài viết chưa thể hiện rõ: ${missingTerms.join(", ")}.`,
      correction: "Thêm các từ khóa vào một câu tự nhiên, đúng bối cảnh.",
      example: prompt.part === 1 ? prompt.sampleAnswers[0]?.answer ?? null : null,
    });
  }
  failedRules.slice(0, 2).forEach((check) => {
    issues.push({ title: check.label, explanation: check.detail, correction: nextStepForCheck(prompt, check), example: null });
  });
  if (issues.length === 0) {
    issues.push({
      title: "Cần phản hồi AI chi tiết hơn",
      explanation: "Các kiểm tra cơ bản đã hoàn tất; hãy chấm lại khi kết nối AI khả dụng để nhận góp ý về ngữ pháp và diễn đạt.",
      correction: "Đọc lại bài, kiểm tra mạch ý và gửi chấm lại sau khi chỉnh sửa.",
      example: null,
    });
  }

  return {
    isEstimate: true,
    disclaimer: ESTIMATE_DISCLAIMER,
    providerStatus: "FALLBACK",
    score,
    maxScore: maxScoreFor(prompt.part),
    summary: "Hệ thống đã kiểm tra cấu trúc cơ bản. Phản hồi ngôn ngữ chi tiết sẽ xuất hiện khi dịch vụ AI khả dụng.",
    criteria,
    deterministicChecks: checks,
    strengths: strengths.slice(0, 3),
    issues: issues.slice(0, 4),
    revisedAnswer: null,
    nextAction: prompt.planTemplate[0] ? `Lần viết tiếp theo: ${prompt.planTemplate[0]}` : "Viết lại bài với một ý chính rõ ràng hơn.",
  };
}

function fallbackCriteria(
  prompt: WritingPromptRecord,
  responseText: string,
  checks: WritingDeterministicChecks,
): WritingFeedbackCriterion[] {
  const allTermsUsed = checks.requiredTerms.every((term) => term.found);
  const lengthCheck = checks.checks.find((item) => item.id === "length");
  const sentenceCheck = checks.checks.find((item) => item.id === "sentences");
  const topicalCoverage = topicCoverage(prompt, responseText);
  const responseRules = prompt.responseRules;
  const paragraphCount = responseParagraphCount(checks, prompt);
  const scores: Record<string, number> = {};

  if (prompt.part === 1) {
    scores.languageControl = sentenceCheck?.passed && checks.wordCount >= 5 ? 1 : 0;
    scores.requiredTerms = allTermsUsed ? 1 : 0;
    scores.relevance = topicalCoverage > 0 ? 1 : 0;
  } else if (prompt.part === 2) {
    const completeIdeas = checkIdeaCoverage(prompt, responseText, checks);
    scores.taskResponse = clampInteger(Math.round(2 * Math.min(1, (completeIdeas + (lengthCheck?.passed ? 1 : 0)) / 3)), 0, 2);
    scores.toneOrganization = emailStructureLikely(prompt, checks) ? 1 : 0;
    scores.languageControl = checks.wordCount >= (responseRules.minWords ?? 60) && checks.sentenceCount >= 3 ? 1 : 0;
  } else {
    scores.organization = paragraphCount >= 3 ? 2 : paragraphCount >= 2 || checks.sentenceCount >= 7 ? 1 : 0;
    scores.development = checks.wordCount >= (responseRules.recommendedWords ?? 300) && checkIdeaCoverage(prompt, responseText, checks) >= 2 ? 1 : 0;
    scores.languageControl = checks.wordCount >= Math.max(120, responseRules.minWords ?? 120) && checks.sentenceCount >= 7 ? 1 : 0;
    scores.taskResponse = topicalCoverage > 0 && checkIdeaCoverage(prompt, responseText, checks) >= 1 ? 1 : 0;
  }

  return prompt.rubric.map((criterion) => ({
    ...criterion,
    score: clampInteger(scores[criterion.id] ?? 0, 0, criterion.maxScore),
    feedback: fallbackCriterionFeedback(prompt, criterion.id, checks, allTermsUsed),
  }));
}

function fallbackCriterionFeedback(
  prompt: WritingPromptRecord,
  criterionId: string,
  checks: WritingDeterministicChecks,
  allTermsUsed: boolean,
): string {
  if (criterionId === "requiredTerms") {
    return allTermsUsed ? "Đã tìm thấy đủ từ khóa bắt buộc." : "Hãy kiểm tra và thêm các từ khóa còn thiếu vào câu trả lời.";
  }
  if (criterionId === "taskResponse") {
    return "Điểm tạm tính dựa trên độ dài và các ý nhiệm vụ được nhận diện; AI sẽ đánh giá nội dung chi tiết hơn khi khả dụng.";
  }
  if (criterionId === "organization") {
    return checks.sentenceCount >= 7 ? "Bài đã có đủ câu để phát triển bố cục; hãy kiểm tra các đoạn mở, thân và kết." : "Hãy phát triển bài thành các đoạn có mở bài, ý chính và kết luận.";
  }
  if (criterionId === "toneOrganization") {
    return "Kiểm tra cơ bản dựa trên dấu hiệu bố cục email; hãy đọc lại để bảo đảm giọng điệu lịch sự.";
  }
  if (criterionId === "relevance") {
    return "Kiểm tra cơ bản dựa trên các từ mô tả bối cảnh; AI sẽ đánh giá độ phù hợp với ảnh chi tiết hơn khi khả dụng.";
  }
  return "Kiểm tra tự động chỉ đo cấu trúc cơ bản; hãy chấm lại để nhận góp ý ngôn ngữ chi tiết từ AI.";
}

function buildDeterministicChecks(prompt: WritingPromptRecord, responseText: string): WritingDeterministicChecks {
  const wordCount = countWords(responseText);
  const sentenceCount = countSentences(responseText);
  const terms = prompt.requiredTerms.map((term) => ({ term, found: containsRequiredTerm(responseText, term) }));
  const checks: WritingDeterministicCheck[] = [];
  const rules = prompt.responseRules;
  if (rules.minWords != null || rules.maxWords != null) {
    const min = rules.minWords ?? 0;
    const max = rules.maxWords ?? Number.MAX_SAFE_INTEGER;
    checks.push({
      id: "length",
      label: "Độ dài bài viết",
      passed: wordCount >= min && wordCount <= max,
      detail: wordCount < min
        ? `Bạn đang có ${wordCount} từ. Hãy viết ít nhất ${min} từ.`
        : wordCount > max
          ? `Bạn đang có ${wordCount} từ. Hãy rút gọn còn tối đa ${max} từ.`
          : `Bạn đang có ${wordCount} từ, phù hợp phạm vi luyện tập.`,
    });
  }
  if (rules.minSentences != null || rules.maxSentences != null) {
    const min = rules.minSentences ?? 0;
    const max = rules.maxSentences ?? Number.MAX_SAFE_INTEGER;
    checks.push({
      id: "sentences",
      label: "Số câu",
      passed: sentenceCount >= min && sentenceCount <= max,
      detail: sentenceCount < min
        ? `Bạn đang có ${sentenceCount} câu. Hãy viết ít nhất ${min} câu.`
        : sentenceCount > max
          ? `Bạn đang có ${sentenceCount} câu. Bài này nên có tối đa ${max} câu.`
          : `Bạn đang có ${sentenceCount} câu, phù hợp yêu cầu.`,
    });
  }
  if (terms.length > 0) {
    const missing = terms.filter((item) => !item.found).map((item) => item.term);
    checks.push({
      id: "required-terms",
      label: "Từ khóa bắt buộc",
      passed: missing.length === 0,
      detail: missing.length ? `Cần dùng thêm: ${missing.join(", ")}.` : "Đã tìm thấy đủ từ khóa bắt buộc.",
    });
  }
  return { wordCount, sentenceCount, requiredTerms: terms, checks };
}

function topicCoverage(prompt: WritingPromptRecord, responseText: string): number {
  return prompt.gradingTargets.topicKeywords.filter((keyword) => containsRequiredTerm(responseText, keyword)).length;
}

function checkIdeaCoverage(prompt: WritingPromptRecord, responseText: string, checks: WritingDeterministicChecks): number {
  if (prompt.part === 1) return topicCoverage(prompt, responseText);
  const directSignals = prompt.gradingTargets.requiredIdeas.filter((idea) => containsRequiredTerm(responseText, idea)).length;
  // A sentence-count proxy is deliberately capped below the total. It gives
  // a little structural credit while reserving semantic judgment for Gemini.
  const structuralProxy = Math.min(
    Math.max(0, prompt.gradingTargets.requiredIdeas.length - directSignals),
    Math.floor(checks.sentenceCount / (prompt.part === 2 ? 3 : 4)),
  );
  return directSignals + structuralProxy;
}

function responseParagraphCount(checks: WritingDeterministicChecks, prompt: WritingPromptRecord): number {
  if (prompt.part !== 3) return 0;
  // Without raw text this intentionally only gives partial credit for a
  // sufficiently developed response; Gemini does the semantic check.
  return checks.sentenceCount >= 10 ? 3 : checks.sentenceCount >= 5 ? 2 : checks.sentenceCount >= 2 ? 1 : 0;
}

function emailStructureLikely(prompt: WritingPromptRecord, checks: WritingDeterministicChecks): boolean {
  return prompt.part === 2 && checks.wordCount >= 60 && checks.sentenceCount >= 3;
}

function nextStepForCheck(prompt: WritingPromptRecord, check: WritingDeterministicCheck): string {
  if (check.id === "length") return prompt.responseRules.recommendedWords ? `Mục tiêu gợi ý là khoảng ${prompt.responseRules.recommendedWords} từ.` : "Thêm chi tiết để phát triển ý.";
  if (check.id === "sentences" && prompt.part === 1) return "Giữ lại một câu hoàn chỉnh, rồi dùng dấu chấm ở cuối câu.";
  if (check.id === "sentences") return "Tách ý thành các câu hoàn chỉnh và thêm ví dụ cụ thể.";
  return "Đọc lại yêu cầu trước khi viết lại.";
}

function createSeed(input: Omit<WritingPromptRecord, "version" | "status" | "instructions" | "timeLimitMinutes" | "responseRules" | "rubric" | "sourceLabel" | "createdAtMillis" | "updatedAtMillis" | "email" | "imageUrl" | "imageAlt" | "requiredTerms"> & Partial<Pick<WritingPromptRecord, "instructions" | "timeLimitMinutes" | "responseRules" | "email" | "imageUrl" | "imageAlt" | "requiredTerms">>): WritingPromptRecord {
  const part = input.part;
  return {
    ...input,
    version: 1,
    status: "PUBLISHED",
    instructions: input.instructions ?? defaultInstructions(part),
    timeLimitMinutes: input.timeLimitMinutes ?? DEFAULT_TIMES[part],
    responseRules: input.responseRules ?? DEFAULT_RULES[part],
    rubric: PART_RUBRICS[part],
    sourceLabel: "Nội dung gốc EnglishGo",
    createdAtMillis: null,
    updatedAtMillis: null,
    email: input.email ?? null,
    imageUrl: input.imageUrl ?? null,
    imageAlt: input.imageAlt ?? null,
    requiredTerms: input.requiredTerms ?? [],
  };
}

function defaultInstructions(part: WritingPart): string {
  if (part === 1) return "Write ONE sentence based on the picture. Use both required words or phrases.";
  if (part === 2) return "Read the email and write an appropriate response.";
  return "Write an essay that states and supports your opinion with specific reasons and examples.";
}

function buildPromptRecord(
  id: string,
  input: WritingPromptInput | WritingPromptUpdateInput,
  now: number,
  existing?: WritingPromptRecord,
): WritingPromptRecord {
  const part = validatePart(input.part ?? existing?.part);
  const title = cleanRequiredText(input.title ?? existing?.title, "Title", 160);
  const base = existing ?? baseRecordForPart(id, part, title, now);
  const difficulty = validateDifficulty(input.difficulty ?? base.difficulty);
  const responseRules = normalizeRules(input.responseRules ?? base.responseRules, part);
  return {
    id,
    version: Math.max(1, base.version + (existing ? 1 : 0)),
    part,
    status: validateStatus(input.status ?? base.status),
    orderIndex: base.orderIndex,
    title,
    titleVi: cleanOptionalText(input.titleVi ?? base.titleVi, 160) ?? title,
    summary: cleanOptionalText(input.summary ?? base.summary, 500) ?? "Bài luyện Writing gốc của EnglishGo.",
    instructions: cleanOptionalText(input.instructions ?? base.instructions, 1_500) ?? defaultInstructions(part),
    promptText: cleanOptionalText(input.promptText ?? base.promptText, 4_000) ?? "Write a clear response to the task.",
    tags: cleanStringList(input.tags ?? base.tags, 12, 48),
    difficulty,
    timeLimitMinutes: normalizeTimeLimit(input.timeLimitMinutes ?? base.timeLimitMinutes, part),
    imageUrl: cleanUrlOrPath(input.imageUrl ?? base.imageUrl),
    imageAlt: cleanOptionalText(input.imageAlt ?? base.imageAlt, 300),
    requiredTerms: cleanStringList(input.requiredTerms ?? base.requiredTerms, 6, 60),
    taskChecklist: cleanStringList(input.taskChecklist ?? base.taskChecklist, 8, 240),
    responseRules,
    hints: normalizeHints(input.hints ?? base.hints),
    sampleAnswers: normalizeSampleAnswers(input.sampleAnswers ?? base.sampleAnswers),
    planTemplate: cleanStringList(input.planTemplate ?? base.planTemplate, 8, 240),
    email: normalizeEmail(input.email === undefined ? base.email : input.email),
    rubric: PART_RUBRICS[part],
    sourceLabel: base.sourceLabel || "Nội dung gốc EnglishGo",
    createdAtMillis: base.createdAtMillis ?? now,
    updatedAtMillis: now,
    gradingTargets: normalizeGradingTargets(input.gradingTargets ?? base.gradingTargets),
  };
}

function baseRecordForPart(id: string, part: WritingPart, title: string, now: number): WritingPromptRecord {
  return {
    id,
    version: 0,
    part,
    status: "DRAFT",
    orderIndex: now,
    title,
    titleVi: title,
    summary: "Bài luyện Writing gốc của EnglishGo.",
    instructions: defaultInstructions(part),
    promptText: "Write a clear response to the task.",
    tags: [],
    difficulty: "INTERMEDIATE",
    timeLimitMinutes: DEFAULT_TIMES[part],
    imageUrl: null,
    imageAlt: null,
    requiredTerms: [],
    taskChecklist: [],
    responseRules: DEFAULT_RULES[part],
    hints: [],
    sampleAnswers: [],
    planTemplate: [],
    email: null,
    rubric: PART_RUBRICS[part],
    sourceLabel: "Nội dung gốc EnglishGo",
    createdAtMillis: now,
    updatedAtMillis: now,
    gradingTargets: { topicKeywords: [], requiredIdeas: [] },
  };
}

async function readMergedPromptRecords(): Promise<{ records: WritingPromptRecord[]; source: WritingPromptCatalog["source"] }> {
  try {
    const snapshot = await adminDb.collection(PROMPTS_COLLECTION).get();
    const firestoreRecords = snapshot.docs
      .map((doc) => toPromptRecord(doc.id, recordValue(doc.data())))
      .filter((item): item is WritingPromptRecord => item !== null);
    const merged = mergeSeedAndFirestore(SEED_WRITING_PROMPTS, firestoreRecords);
    return {
      records: merged,
      source: firestoreRecords.length === 0 ? "SEED" : firestoreRecords.length >= SEED_WRITING_PROMPTS.length ? "FIRESTORE" : "MIXED",
    };
  } catch {
    // The original static seed library is intentionally usable in local
    // previews and during a temporary Firestore outage.
    return { records: [...SEED_WRITING_PROMPTS], source: "SEED" };
  }
}

async function findPromptRecord(id: string): Promise<WritingPromptRecord | null> {
  const cleanPromptId = cleanId(id);
  const seeded = SEED_WRITING_PROMPTS.find((item) => item.id === cleanPromptId) ?? null;
  try {
    const snapshot = await adminDb.collection(PROMPTS_COLLECTION).doc(cleanPromptId).get();
    if (snapshot.exists) return toPromptRecord(cleanPromptId, recordValue(snapshot.data())) ?? seeded;
  } catch {
    // Fall back to the bundled original content only. Non-seed private/admin
    // content cannot be exposed when Firestore is unavailable.
  }
  return seeded;
}

function mergeSeedAndFirestore(seeds: WritingPromptRecord[], firestore: WritingPromptRecord[]): WritingPromptRecord[] {
  const merged = new Map<string, WritingPromptRecord>(seeds.map((item) => [item.id, item]));
  firestore.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

function toPromptRecord(id: string, data: Record<string, unknown>): WritingPromptRecord | null {
  const part = asPart(data.part);
  const title = cleanOptionalText(data.title, 160);
  if (!part || !title) return null;
  const base = baseRecordForPart(id, part, title, numberValue(data.createdAtMillis) ?? Date.now());
  return {
    ...base,
    version: Math.max(1, integerValue(data.version) ?? 1),
    status: asStatus(data.status) ?? base.status,
    orderIndex: numberValue(data.orderIndex) ?? base.orderIndex,
    title,
    titleVi: cleanOptionalText(data.titleVi, 160) ?? title,
    summary: cleanOptionalText(data.summary, 500) ?? base.summary,
    instructions: cleanOptionalText(data.instructions, 1_500) ?? base.instructions,
    promptText: cleanOptionalText(data.promptText, 4_000) ?? base.promptText,
    tags: cleanStringList(data.tags, 12, 48),
    difficulty: asDifficulty(data.difficulty) ?? base.difficulty,
    timeLimitMinutes: normalizeTimeLimit(numberValue(data.timeLimitMinutes) ?? base.timeLimitMinutes, part),
    imageUrl: cleanUrlOrPath(data.imageUrl),
    imageAlt: cleanOptionalText(data.imageAlt, 300),
    requiredTerms: cleanStringList(data.requiredTerms, 6, 60),
    taskChecklist: cleanStringList(data.taskChecklist, 8, 240),
    responseRules: normalizeRules(recordValue(data.responseRules), part),
    hints: normalizeHints(arrayValue(data.hints)),
    sampleAnswers: normalizeSampleAnswers(arrayValue(data.sampleAnswers)),
    planTemplate: cleanStringList(data.planTemplate, 8, 240),
    email: normalizeEmail(data.email == null ? null : recordValue(data.email)),
    sourceLabel: cleanOptionalText(data.sourceLabel, 100) ?? "Nội dung gốc EnglishGo",
    createdAtMillis: numberValue(data.createdAtMillis),
    updatedAtMillis: numberValue(data.updatedAtMillis),
    gradingTargets: normalizeGradingTargets(recordValue(data.gradingTargets)),
  };
}

function toPublicPrompt(record: WritingPromptRecord): WritingPrompt {
  const prompt = { ...record } as Partial<WritingPromptRecord>;
  delete prompt.gradingTargets;
  return prompt as WritingPrompt;
}

function serializePrompt(
  prompt: WritingPromptRecord,
  extra: Record<string, unknown>,
  includeCreatedAt = true,
): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    ...prompt,
    ...extra,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (includeCreatedAt) serialized.createdAt = FieldValue.serverTimestamp();
  return serialized;
}

function toAttempt(id: string, data: Record<string, unknown>): WritingAttempt | null {
  const promptPart = asPart(data.promptPart);
  const responseText = cleanOptionalText(data.responseText, MAX_RESPONSE_CHARACTERS);
  const feedback = toFeedback(recordValue(data.feedback));
  const submittedAtMillis = numberValue(data.submittedAtMillis);
  if (!promptPart || !responseText || !feedback || submittedAtMillis == null) return null;
  return {
    id,
    promptId: cleanOptionalText(data.promptId, 160) ?? "",
    promptPart,
    promptTitle: cleanOptionalText(data.promptTitle, 160) ?? "Writing practice",
    promptVersion: Math.max(1, integerValue(data.promptVersion) ?? 1),
    responseText,
    wordCount: Math.max(0, integerValue(data.wordCount) ?? countWords(responseText)),
    elapsedSeconds: nullablePositiveInteger(data.elapsedSeconds),
    usedHintLevels: normalizeHintLevels(arrayValue(data.usedHintLevels).map(numberValue).filter((item): item is number => item != null)),
    usedSample: Boolean(data.usedSample),
    feedback,
    submittedAtMillis,
    createdAtMillis: numberValue(data.createdAtMillis),
  };
}

function toFeedback(data: Record<string, unknown>): WritingFeedback | null {
  const maxScore = integerValue(data.maxScore);
  const score = integerValue(data.score);
  const providerStatus = data.providerStatus === "GEMINI" ? "GEMINI" : data.providerStatus === "FALLBACK" ? "FALLBACK" : null;
  if (maxScore == null || score == null || !providerStatus) return null;
  const criteria = arrayValue(data.criteria).map(recordValue).map((item): WritingFeedbackCriterion | null => {
    const id = cleanOptionalText(item.id, 80);
    const label = cleanOptionalText(item.label, 120);
    const criterionMax = integerValue(item.maxScore);
    const criterionScore = integerValue(item.score);
    if (!id || !label || criterionMax == null || criterionScore == null) return null;
    return { id, label, maxScore: criterionMax, score: clampInteger(criterionScore, 0, criterionMax), description: cleanOptionalText(item.description, 300) ?? "", feedback: cleanOptionalText(item.feedback, 500) ?? "" };
  }).filter((item): item is WritingFeedbackCriterion => item !== null);
  if (!criteria.length) return null;
  const deterministicChecks = toDeterministicChecks(recordValue(data.deterministicChecks));
  if (!deterministicChecks) return null;
  return {
    isEstimate: true,
    disclaimer: cleanOptionalText(data.disclaimer, 500) ?? ESTIMATE_DISCLAIMER,
    providerStatus,
    score: clampInteger(score, 0, maxScore),
    maxScore,
    summary: cleanOptionalText(data.summary, 700) ?? "",
    criteria,
    deterministicChecks,
    strengths: stringArray(data.strengths, 3, 240),
    issues: arrayValue(data.issues).map(recordValue).map(toFeedbackIssue).filter((item): item is WritingFeedbackIssue => item !== null).slice(0, 4),
    revisedAnswer: cleanOptionalText(data.revisedAnswer, 3_000),
    nextAction: cleanOptionalText(data.nextAction, 500) ?? "Viết lại bài với một ý chính rõ ràng hơn.",
  };
}

function toDeterministicChecks(data: Record<string, unknown>): WritingDeterministicChecks | null {
  const wordCount = integerValue(data.wordCount);
  const sentenceCount = integerValue(data.sentenceCount);
  if (wordCount == null || sentenceCount == null) return null;
  const requiredTerms = arrayValue(data.requiredTerms).map(recordValue).map((item) => {
    const term = cleanOptionalText(item.term, 60);
    return term ? { term, found: Boolean(item.found) } : null;
  }).filter((item): item is { term: string; found: boolean } => item !== null);
  const checks = arrayValue(data.checks).map(recordValue).map((item) => {
    const id = cleanOptionalText(item.id, 80);
    const label = cleanOptionalText(item.label, 120);
    const detail = cleanOptionalText(item.detail, 500);
    return id && label && detail ? { id, label, detail, passed: Boolean(item.passed) } : null;
  }).filter((item): item is WritingDeterministicCheck => item !== null);
  return { wordCount: Math.max(0, wordCount), sentenceCount: Math.max(0, sentenceCount), requiredTerms, checks };
}

function toFeedbackIssue(data: Record<string, unknown>): WritingFeedbackIssue | null {
  const title = cleanOptionalText(data.title, 160);
  const explanation = cleanOptionalText(data.explanation, 700);
  if (!title || !explanation) return null;
  return {
    title,
    explanation,
    correction: cleanOptionalText(data.correction, 500),
    example: cleanOptionalText(data.example, 700),
  };
}

async function recordWritingAudit(
  action: string,
  promptId: string,
  uid: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await adminDb.collection(CONTENT_AUDIT_COLLECTION).add({
    module: "WRITING",
    action,
    promptId,
    actorUid: uid,
    ...detail,
    createdAtMillis: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

function validatePart(value: unknown): WritingPart {
  const part = asPart(value);
  if (!part) throw BadRequest("Writing part must be 1, 2, or 3");
  return part;
}

function asPart(value: unknown): WritingPart | null {
  const numeric = Number(value);
  return (WRITING_PARTS as readonly number[]).includes(numeric) ? numeric as WritingPart : null;
}

function validateStatus(value: unknown): WritingPromptStatus {
  const status = asStatus(value);
  if (!status) throw BadRequest("Invalid Writing prompt status");
  return status;
}

function asStatus(value: unknown): WritingPromptStatus | null {
  return typeof value === "string" && (WRITING_PROMPT_STATUSES as readonly string[]).includes(value)
    ? value as WritingPromptStatus
    : null;
}

function validateDifficulty(value: unknown): WritingDifficulty {
  const difficulty = asDifficulty(value);
  if (!difficulty) throw BadRequest("Invalid Writing difficulty");
  return difficulty;
}

function asDifficulty(value: unknown): WritingDifficulty | null {
  return typeof value === "string" && (WRITING_DIFFICULTIES as readonly string[]).includes(value)
    ? value as WritingDifficulty
    : null;
}

function normalizeRules(value: unknown, part: WritingPart): WritingResponseRules {
  const raw = recordValue(value);
  const defaults = DEFAULT_RULES[part];
  const minWords = nullableBoundedInteger(raw.minWords, 0, 1_000) ?? defaults.minWords;
  const recommendedWords = nullableBoundedInteger(raw.recommendedWords, 0, 1_000) ?? defaults.recommendedWords;
  const maxWords = nullableBoundedInteger(raw.maxWords, 1, 2_000) ?? defaults.maxWords;
  const minSentences = nullableBoundedInteger(raw.minSentences, 0, 100) ?? defaults.minSentences;
  const maxSentences = nullableBoundedInteger(raw.maxSentences, 1, 100) ?? defaults.maxSentences;
  return {
    minWords: Math.min(minWords ?? 0, maxWords ?? 2_000),
    recommendedWords: recommendedWords == null ? undefined : Math.max(minWords ?? 0, Math.min(recommendedWords, maxWords ?? 2_000)),
    maxWords,
    minSentences: Math.min(minSentences ?? 0, maxSentences ?? 100),
    maxSentences,
  };
}

function normalizeTimeLimit(value: unknown, part: WritingPart): number {
  return clampInteger(numberValue(value) ?? DEFAULT_TIMES[part], 1, 90);
}

function normalizeHints(value: unknown): WritingHint[] {
  return arrayValue(value).map(recordValue).map((item, index) => {
    const title = cleanOptionalText(item.title, 120);
    const body = cleanOptionalText(item.body, 700);
    if (!title || !body) return null;
    return { title, body, level: clampInteger(numberValue(item.level) ?? index + 1, 1, 5) };
  }).filter((item): item is WritingHint => item !== null).sort((a, b) => a.level - b.level).slice(0, 5);
}

function normalizeSampleAnswers(value: unknown): WritingSampleAnswer[] {
  return arrayValue(value).map(recordValue).map((item) => {
    const answer = cleanOptionalText(item.answer, 3_000);
    if (!answer) return null;
    return { answer, translationVi: cleanOptionalText(item.translationVi, 3_000), notes: cleanOptionalText(item.notes, 700) };
  }).filter((item): item is WritingSampleAnswer => item !== null).slice(0, 3);
}

function normalizeEmail(value: unknown): WritingEmailBrief | null {
  if (value == null) return null;
  const item = recordValue(value);
  const email: WritingEmailBrief = {
    fromName: cleanOptionalText(item.fromName, 160),
    toName: cleanOptionalText(item.toName, 160),
    subject: cleanOptionalText(item.subject, 240),
    body: cleanOptionalText(item.body, 4_000),
    signature: cleanOptionalText(item.signature, 160),
  };
  return Object.values(email).some(Boolean) ? email : null;
}

function normalizeGradingTargets(value: unknown): WritingGradingTargets {
  const item = recordValue(value);
  return {
    topicKeywords: cleanStringList(item.topicKeywords, 12, 60),
    requiredIdeas: cleanStringList(item.requiredIdeas, 8, 120),
  };
}

function normalizeElapsedSeconds(value: unknown): number | null {
  if (value == null) return null;
  const number = integerValue(value);
  return number == null ? null : clampInteger(number, 0, 86_400);
}

function normalizeHintLevels(value: unknown): number[] {
  const numbers = arrayValue(value).map(numberValue).filter((item): item is number => item != null);
  return [...new Set(numbers.map((item) => clampInteger(item, 1, 5)))].sort((a, b) => a - b).slice(0, 5);
}

function normalizeHistoryLimit(value: unknown): number {
  const parsed = integerValue(value);
  return clampInteger(parsed ?? 12, 1, MAX_HISTORY_ITEMS);
}

function cleanResponse(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (cleaned.length > MAX_RESPONSE_CHARACTERS) throw BadRequest(`Bài viết tối đa ${MAX_RESPONSE_CHARACTERS} ký tự.`);
  return cleaned;
}

function cleanId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(id)) throw BadRequest("Invalid Writing prompt id");
  return id;
}

function cleanRequiredText(value: unknown, field: string, maxLength: number): string {
  const cleaned = cleanOptionalText(value, maxLength);
  if (!cleaned) throw BadRequest(`${field} is required`);
  return cleaned;
}

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\u0000/g, "").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanShortText(value: unknown, maxLength: number): string | null {
  const result = cleanOptionalText(value, maxLength);
  return result?.replace(/\s*\n\s*/g, " ") ?? null;
}

function cleanStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.map((item) => cleanShortText(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
}

function cleanUrlOrPath(value: unknown): string | null {
  const text = cleanOptionalText(value, 1_000);
  if (!text) return null;
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function containsRequiredTerm(responseText: string, term: string): boolean {
  const normalizedResponse = normalizeForMatch(responseText);
  const words = normalizeForMatch(term).split(" ").filter(Boolean);
  if (!words.length) return false;
  return words.every((word) => {
    const stem = word.length > 5 ? word.slice(0, -1) : word;
    return new RegExp(`(^|\\s)${escapeRegExp(stem)}[a-z]*(?=\\s|$)`, "i").test(normalizedResponse);
  });
}

function normalizeForMatch(value: string): string {
  return ` ${value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countWords(value: string): number {
  return value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
}

function countSentences(value: string): number {
  const stripped = value.trim();
  if (!stripped) return 0;
  const sentenceMatches = stripped.match(/[.!?]+(?=\s|$)|[.!?]+$/g);
  return sentenceMatches?.length ?? 1;
}

function maxScoreFor(part: WritingPart): number {
  return PART_RUBRICS[part].reduce((sum, item) => sum + item.maxScore, 0);
}

function sortPrompts(a: WritingPromptRecord, b: WritingPromptRecord): number {
  return a.part - b.part || a.orderIndex - b.orderIndex || a.title.localeCompare(b.title);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

function nullableBoundedInteger(value: unknown, min: number, max: number): number | undefined {
  const parsed = integerValue(value);
  return parsed == null ? undefined : clampInteger(parsed, min, max);
}

function nullablePositiveInteger(value: unknown): number | null {
  const parsed = integerValue(value);
  return parsed == null ? null : Math.max(0, parsed);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerValue(value: unknown): number | null {
  const number = numberValue(value);
  return number != null && Number.isInteger(number) ? number : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  return cleanStringList(value, maxItems, maxLength);
}
