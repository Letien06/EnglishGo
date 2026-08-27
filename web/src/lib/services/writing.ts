import { FieldValue } from "firebase-admin/firestore";
import { revalidateTag, unstable_cache } from "next/cache";
import { BadRequest, NotFound } from "@/lib/api/response";
import { adminDb } from "@/lib/firestore/db";
import { generateJson } from "@/lib/services/gemini";
import { enforceDailyActionLimit } from "@/lib/services/rate-limit";
import type { AppUser } from "@/types";
import {
  WRITING_DIFFICULTIES,
  WRITING_PARTS,
  WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS,
  WRITING_PART_ONE_GRAMMAR_CATEGORIES,
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
  type WritingPartOneGrammarCategory,
  type WritingPrompt,
  type WritingPromptCard,
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
const WRITING_PROMPT_CACHE_TAG = "writing-prompts";
const WRITING_MEDIA_VERSION = "v1";
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
    part1Category: "V_N",
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
    part1Category: "V_N",
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
    part1Category: "V_N",
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
    part1Category: "V_N",
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
    part1Category: "V_N",
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
  ...createExpandedPartOneSeeds(),
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
  ...createExpandedPartTwoSeeds(),
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
  const { records, source } = await cachedReadMergedPromptRecords();
  const items = records
    .filter((item) => item.status === "PUBLISHED")
    .filter((item) => part == null || item.part === part)
    .sort(sortPrompts)
    .map(toWritingPromptCard);
  return { items, total: items.length, source };
}

/** Retrieve a public prompt. Archived, draft and review prompts are hidden. */
export async function getWritingPrompt(id: string): Promise<WritingPrompt> {
  const record = await cachedFindPromptRecord(cleanId(id));
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
    invalidateWritingPromptCache();
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
  invalidateWritingPromptCache();
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
  invalidateWritingPromptCache();
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

interface PartOneSeedVariant {
  id: string;
  orderIndex: number;
  part1Category: WritingPartOneGrammarCategory;
  title: string;
  titleVi: string;
  summary: string;
  imageUrl: string;
  imageAlt: string;
  requiredTerms: [string, string];
  tags: string[];
  observation: string;
  frame: string;
  sampleAnswers: WritingSampleAnswer[];
  planTemplate: string[];
  topicKeywords: string[];
}

interface PartTwoSeedVariant {
  id: string;
  orderIndex: number;
  title: string;
  titleVi: string;
  summary: string;
  promptText: string;
  tags: string[];
  difficulty: WritingDifficulty;
  email: WritingEmailBrief;
  taskChecklist: string[];
  hints: WritingHint[];
  sampleAnswer: WritingSampleAnswer;
  planTemplate: string[];
  topicKeywords: string[];
  requiredIdeas: string[];
}

function originalSample(answer: string, translationVi: string, notes: string): WritingSampleAnswer {
  return { answer, translationVi, notes };
}

/**
 * Additional original Part 1 drills. The first expansion established six
 * prompts per grammar category; the second expansion gives learners a much
 * larger, balanced pool while keeping every existing prompt stable.
 */
function createExpandedPartOneSeeds(): WritingPromptRecord[] {
  const variants: PartOneSeedVariant[] = [
    {
      id: "p1-organizing-materials",
      orderIndex: 60,
      part1Category: "V_N",
      title: "Organizing meeting materials",
      titleVi: "Sắp xếp tài liệu cuộc họp",
      summary: "Luyện dạng V + N với hoạt động sắp xếp tài liệu trước cuộc họp.",
      imageUrl: "/writing/meeting-preparation.png",
      imageAlt: "A colleague arranging materials in a meeting room before a presentation.",
      requiredTerms: ["organize", "materials"],
      tags: ["office", "meeting", "present continuous"],
      observation: "Một nhân viên đang sắp xếp tài liệu trên bàn trong phòng họp.",
      frame: "The employee is organizing the materials for the meeting.",
      sampleAnswers: [
        { answer: "The employee is organizing the materials for the meeting.", translationVi: "Nhân viên đang sắp xếp tài liệu cho cuộc họp.", notes: "Dạng V + N: organizing + the materials." },
        { answer: "A woman is organizing materials on the conference table.", translationVi: "Một phụ nữ đang sắp xếp tài liệu trên bàn họp.", notes: "Dùng hiện tại tiếp diễn để mô tả hành động trong tranh." },
      ],
      planTemplate: ["Name the employee.", "Use organize as the action.", "Add materials and the meeting context."],
      topicKeywords: ["employee", "materials", "meeting", "table", "room"],
    },
    {
      id: "p1-employee-desk",
      orderIndex: 70,
      part1Category: "N_N",
      title: "Employee at a desk",
      titleVi: "Nhân viên tại bàn làm việc",
      summary: "Luyện dạng N + N với người và đồ vật trong văn phòng.",
      imageUrl: "/writing/office-report.png",
      imageAlt: "An office employee reading a printed report at a desk with a laptop.",
      requiredTerms: ["employee", "desk"],
      tags: ["office", "workplace", "present continuous"],
      observation: "Một nhân viên đang đọc tài liệu tại bàn làm việc cạnh máy tính xách tay.",
      frame: "The employee at the desk is checking a document.",
      sampleAnswers: [
        { answer: "The employee at the desk is checking a document.", translationVi: "Nhân viên tại bàn làm việc đang kiểm tra một tài liệu.", notes: "Dạng N + N: employee và desk cùng xuất hiện tự nhiên." },
        { answer: "An employee is sitting at a desk beside a laptop.", translationVi: "Một nhân viên đang ngồi tại bàn làm việc cạnh máy tính xách tay.", notes: "Giữ đúng một câu hoàn chỉnh." },
      ],
      planTemplate: ["Identify the employee.", "Include desk as the place or object.", "Describe the visible action."],
      topicKeywords: ["employee", "desk", "laptop", "report", "office"],
    },
    {
      id: "p1-server-customer",
      orderIndex: 80,
      part1Category: "N_N",
      title: "Server and customer",
      titleVi: "Nhân viên phục vụ và khách hàng",
      summary: "Luyện dạng N + N trong bối cảnh phục vụ nhà hàng.",
      imageUrl: "/writing/restaurant-service.png",
      imageAlt: "A restaurant server speaking with a customer while holding a menu.",
      requiredTerms: ["server", "customer"],
      tags: ["restaurant", "customer service", "present continuous"],
      observation: "Một nhân viên phục vụ đang trò chuyện với khách hàng bên bàn ăn.",
      frame: "The server is speaking to a customer at the table.",
      sampleAnswers: [
        { answer: "The server is speaking to a customer at the table.", translationVi: "Nhân viên phục vụ đang nói chuyện với một khách hàng tại bàn.", notes: "Dạng N + N: server và customer." },
        { answer: "A server is showing the menu to a customer in the restaurant.", translationVi: "Một nhân viên đang cho khách hàng xem thực đơn trong nhà hàng.", notes: "Thêm ngữ cảnh để câu sát với tranh." },
      ],
      planTemplate: ["Name the server.", "Add the customer.", "Describe their interaction."],
      topicKeywords: ["server", "customer", "restaurant", "menu", "table"],
    },
    {
      id: "p1-worker-packages",
      orderIndex: 90,
      part1Category: "N_N",
      title: "Worker and packages",
      titleVi: "Nhân viên và các kiện hàng",
      summary: "Luyện dạng N + N với người giao hàng và kiện hàng.",
      imageUrl: "/writing/delivery-packages.png",
      imageAlt: "A delivery worker loading packages into a van outside an office building.",
      requiredTerms: ["worker", "packages"],
      tags: ["logistics", "delivery", "present continuous"],
      observation: "Một nhân viên giao hàng đang mang các kiện hàng tới xe tải nhỏ.",
      frame: "The worker is carrying packages to the van.",
      sampleAnswers: [
        { answer: "The worker is carrying packages to the van.", translationVi: "Nhân viên đang mang các kiện hàng tới xe tải nhỏ.", notes: "Dạng N + N: worker và packages." },
        { answer: "A delivery worker is loading packages outside the building.", translationVi: "Một nhân viên giao hàng đang chất các kiện hàng bên ngoài tòa nhà.", notes: "delivery chỉ vai trò của worker." },
      ],
      planTemplate: ["Identify the worker.", "Include packages.", "Add the van or building."],
      topicKeywords: ["worker", "packages", "van", "delivery", "building"],
    },
    {
      id: "p1-traveler-luggage",
      orderIndex: 100,
      part1Category: "N_N",
      title: "Traveler and luggage",
      titleVi: "Hành khách và hành lý",
      summary: "Luyện dạng N + N tại khu vực chờ của sân bay.",
      imageUrl: "/writing/airport-flight.png",
      imageAlt: "A traveler with luggage looking up at an airport flight information board.",
      requiredTerms: ["traveler", "luggage"],
      tags: ["travel", "airport", "present continuous"],
      observation: "Một hành khách đứng cạnh hành lý và nhìn lên bảng thông tin chuyến bay.",
      frame: "The traveler is standing beside his luggage at the airport.",
      sampleAnswers: [
        { answer: "The traveler is standing beside his luggage at the airport.", translationVi: "Hành khách đang đứng cạnh hành lý của mình tại sân bay.", notes: "Dạng N + N: traveler và luggage." },
        { answer: "A traveler with luggage is checking the flight board.", translationVi: "Một hành khách có hành lý đang kiểm tra bảng chuyến bay.", notes: "with nối danh từ và đồ vật trong tranh." },
      ],
      planTemplate: ["Name the traveler.", "Include luggage.", "Describe the flight board or airport."],
      topicKeywords: ["traveler", "luggage", "airport", "board", "flight"],
    },
    {
      id: "p1-report-laptop",
      orderIndex: 110,
      part1Category: "N_N",
      title: "Report and laptop",
      titleVi: "Báo cáo và máy tính xách tay",
      summary: "Luyện dạng N + N với đồ vật quen thuộc trong văn phòng.",
      imageUrl: "/writing/office-report.png",
      imageAlt: "An office employee reading a printed report at a desk with a laptop.",
      requiredTerms: ["report", "laptop"],
      tags: ["office", "documents", "workplace"],
      observation: "Một báo cáo giấy đặt cạnh máy tính xách tay trên bàn làm việc.",
      frame: "The report is lying next to the laptop on the desk.",
      sampleAnswers: [
        { answer: "The report is lying next to the laptop on the desk.", translationVi: "Bản báo cáo đang nằm cạnh máy tính xách tay trên bàn.", notes: "Dạng N + N: report và laptop." },
        { answer: "A report and a laptop are on the employee's desk.", translationVi: "Một bản báo cáo và máy tính xách tay ở trên bàn của nhân viên.", notes: "Dùng and để nối hai danh từ." },
      ],
      planTemplate: ["Include report.", "Include laptop.", "Add the desk as the location."],
      topicKeywords: ["report", "laptop", "desk", "document", "office"],
    },
    {
      id: "p1-screen-meeting",
      orderIndex: 120,
      part1Category: "N_N",
      title: "Screen for a meeting",
      titleVi: "Màn hình cho cuộc họp",
      summary: "Luyện dạng N + N với thiết bị và hoạt động trong phòng họp.",
      imageUrl: "/writing/meeting-preparation.png",
      imageAlt: "A colleague arranging materials in a meeting room before a presentation.",
      requiredTerms: ["screen", "meeting"],
      tags: ["office", "meeting", "presentation"],
      observation: "Màn hình và tài liệu đã được chuẩn bị trong phòng họp.",
      frame: "The screen is ready for the meeting in the conference room.",
      sampleAnswers: [
        { answer: "The screen is ready for the meeting in the conference room.", translationVi: "Màn hình đã sẵn sàng cho cuộc họp trong phòng họp.", notes: "Dạng N + N: screen và meeting." },
        { answer: "The meeting screen is set up beside the materials.", translationVi: "Màn hình cho cuộc họp được lắp đặt cạnh các tài liệu.", notes: "meeting có thể bổ nghĩa cho screen." },
      ],
      planTemplate: ["Name the screen.", "Include meeting.", "Add the conference room or materials."],
      topicKeywords: ["screen", "meeting", "room", "materials", "presentation"],
    },
    {
      id: "p1-employee-at-desk",
      orderIndex: 130,
      part1Category: "N_PREP",
      title: "Employee at a desk",
      titleVi: "Nhân viên ở bàn làm việc",
      summary: "Luyện dạng N + Prep với giới từ chỉ vị trí trong văn phòng.",
      imageUrl: "/writing/office-report.png",
      imageAlt: "An office employee reading a printed report at a desk with a laptop.",
      requiredTerms: ["employee", "at"],
      tags: ["office", "position", "present continuous"],
      observation: "Một nhân viên đang làm việc tại bàn với báo cáo và máy tính.",
      frame: "The employee is working at a desk beside a laptop.",
      sampleAnswers: [
        { answer: "The employee is working at a desk beside a laptop.", translationVi: "Nhân viên đang làm việc tại một chiếc bàn cạnh máy tính xách tay.", notes: "Dạng N + Prep: employee + at." },
        { answer: "An employee at the desk is reviewing a report.", translationVi: "Một nhân viên tại bàn làm việc đang xem lại báo cáo.", notes: "at the desk bổ nghĩa cho employee." },
      ],
      planTemplate: ["Use employee.", "Place the employee at a desk.", "Describe the report or laptop."],
      topicKeywords: ["employee", "desk", "report", "laptop", "office"],
    },
    {
      id: "p1-server-at-table",
      orderIndex: 140,
      part1Category: "N_PREP",
      title: "Server at a table",
      titleVi: "Nhân viên phục vụ ở bàn ăn",
      summary: "Luyện dạng N + Prep với bối cảnh phục vụ nhà hàng.",
      imageUrl: "/writing/restaurant-service.png",
      imageAlt: "A restaurant server speaking with a customer while holding a menu.",
      requiredTerms: ["server", "at"],
      tags: ["restaurant", "position", "customer service"],
      observation: "Một nhân viên phục vụ đang đứng tại bàn của khách hàng.",
      frame: "The server is standing at a restaurant table.",
      sampleAnswers: [
        { answer: "The server is standing at a restaurant table.", translationVi: "Nhân viên phục vụ đang đứng tại một bàn trong nhà hàng.", notes: "Dạng N + Prep: server + at." },
        { answer: "A server at the table is holding a menu.", translationVi: "Một nhân viên ở bàn ăn đang cầm thực đơn.", notes: "at the table mô tả vị trí của server." },
      ],
      planTemplate: ["Use server.", "Add at the table.", "Mention the menu or customer."],
      topicKeywords: ["server", "table", "menu", "customer", "restaurant"],
    },
    {
      id: "p1-worker-near-van",
      orderIndex: 150,
      part1Category: "N_PREP",
      title: "Worker near a van",
      titleVi: "Nhân viên gần xe giao hàng",
      summary: "Luyện dạng N + Prep với vị trí bên cạnh xe giao hàng.",
      imageUrl: "/writing/delivery-packages.png",
      imageAlt: "A delivery worker loading packages into a van outside an office building.",
      requiredTerms: ["worker", "near"],
      tags: ["delivery", "position", "logistics"],
      observation: "Một nhân viên giao hàng đứng gần xe tải nhỏ và các kiện hàng.",
      frame: "The worker is standing near the delivery van.",
      sampleAnswers: [
        { answer: "The worker is standing near the delivery van.", translationVi: "Nhân viên đang đứng gần xe giao hàng.", notes: "Dạng N + Prep: worker + near." },
        { answer: "A worker near the van is moving packages.", translationVi: "Một nhân viên gần xe tải nhỏ đang di chuyển các kiện hàng.", notes: "near the van bổ nghĩa cho worker." },
      ],
      planTemplate: ["Use worker.", "Place the worker near the van.", "Add the packages if useful."],
      topicKeywords: ["worker", "van", "packages", "delivery", "building"],
    },
    {
      id: "p1-traveler-at-airport",
      orderIndex: 160,
      part1Category: "N_PREP",
      title: "Traveler at an airport",
      titleVi: "Hành khách ở sân bay",
      summary: "Luyện dạng N + Prep trong bối cảnh chờ chuyến bay.",
      imageUrl: "/writing/airport-flight.png",
      imageAlt: "A traveler with luggage looking up at an airport flight information board.",
      requiredTerms: ["traveler", "at"],
      tags: ["airport", "travel", "position"],
      observation: "Một hành khách đang ở sân bay và nhìn bảng thông tin chuyến bay.",
      frame: "The traveler is waiting at the airport near the flight board.",
      sampleAnswers: [
        { answer: "The traveler is waiting at the airport near the flight board.", translationVi: "Hành khách đang chờ ở sân bay gần bảng chuyến bay.", notes: "Dạng N + Prep: traveler + at." },
        { answer: "A traveler at the airport is checking the departure board.", translationVi: "Một hành khách ở sân bay đang kiểm tra bảng khởi hành.", notes: "at the airport cho biết địa điểm." },
      ],
      planTemplate: ["Use traveler.", "Add at the airport.", "Mention the board or luggage."],
      topicKeywords: ["traveler", "airport", "board", "luggage", "flight"],
    },
    {
      id: "p1-documents-on-desk",
      orderIndex: 170,
      part1Category: "N_PREP",
      title: "Documents on a desk",
      titleVi: "Tài liệu trên bàn làm việc",
      summary: "Luyện dạng N + Prep với giới từ chỉ vị trí của đồ vật.",
      imageUrl: "/writing/office-report.png",
      imageAlt: "An office employee reading a printed report at a desk with a laptop.",
      requiredTerms: ["documents", "on"],
      tags: ["office", "documents", "position"],
      observation: "Các tài liệu giấy đặt trên bàn cạnh máy tính xách tay.",
      frame: "The documents are on the desk next to a laptop.",
      sampleAnswers: [
        { answer: "The documents are on the desk next to a laptop.", translationVi: "Các tài liệu ở trên bàn cạnh một máy tính xách tay.", notes: "Dạng N + Prep: documents + on." },
        { answer: "Several documents on the desk are being reviewed by an employee.", translationVi: "Một vài tài liệu trên bàn đang được nhân viên xem lại.", notes: "on the desk có thể bổ nghĩa cho documents." },
      ],
      planTemplate: ["Use documents.", "Place them on the desk.", "Add the laptop or employee."],
      topicKeywords: ["documents", "desk", "laptop", "report", "office"],
    },
    {
      id: "p1-screen-in-room",
      orderIndex: 180,
      part1Category: "N_PREP",
      title: "Screen in a meeting room",
      titleVi: "Màn hình trong phòng họp",
      summary: "Luyện dạng N + Prep với thiết bị trong phòng họp.",
      imageUrl: "/writing/meeting-preparation.png",
      imageAlt: "A colleague arranging materials in a meeting room before a presentation.",
      requiredTerms: ["screen", "in"],
      tags: ["meeting", "office", "position"],
      observation: "Một màn hình được đặt trong phòng họp cùng tài liệu trình bày.",
      frame: "The screen is in the meeting room beside the materials.",
      sampleAnswers: [
        { answer: "The screen is in the meeting room beside the materials.", translationVi: "Màn hình ở trong phòng họp cạnh các tài liệu.", notes: "Dạng N + Prep: screen + in." },
        { answer: "A screen in the room is ready for the presentation.", translationVi: "Một màn hình trong phòng đã sẵn sàng cho bài thuyết trình.", notes: "in the room bổ nghĩa cho screen." },
      ],
      planTemplate: ["Use screen.", "Place it in the meeting room.", "Add the materials or presentation."],
      topicKeywords: ["screen", "room", "materials", "presentation", "meeting"],
    },
    {
      id: "p1-wait-for-flight",
      orderIndex: 190,
      part1Category: "V_PREP",
      title: "Waiting for a flight",
      titleVi: "Chờ chuyến bay",
      summary: "Luyện dạng V + Prep với cụm wait for trong sân bay.",
      imageUrl: "/writing/airport-flight.png",
      imageAlt: "A traveler with luggage looking up at an airport flight information board.",
      requiredTerms: ["wait", "for"],
      tags: ["airport", "travel", "present continuous"],
      observation: "Một hành khách đang chờ chuyến bay và kiểm tra bảng thông tin.",
      frame: "The passenger is waiting for a flight near the departure board.",
      sampleAnswers: [
        { answer: "The passenger is waiting for a flight near the departure board.", translationVi: "Hành khách đang chờ một chuyến bay gần bảng khởi hành.", notes: "Dạng V + Prep: wait + for." },
        { answer: "A traveler is waiting for his flight with his luggage.", translationVi: "Một hành khách đang chờ chuyến bay cùng hành lý.", notes: "Dùng hiện tại tiếp diễn để mô tả tranh." },
      ],
      planTemplate: ["Use wait.", "Add for before the flight.", "Mention the board or luggage."],
      topicKeywords: ["passenger", "flight", "airport", "board", "luggage"],
    },
    {
      id: "p1-talk-to-customer",
      orderIndex: 200,
      part1Category: "V_PREP",
      title: "Talking to a customer",
      titleVi: "Nói chuyện với khách hàng",
      summary: "Luyện dạng V + Prep với cụm talk to trong nhà hàng.",
      imageUrl: "/writing/restaurant-service.png",
      imageAlt: "A restaurant server speaking with a customer while holding a menu.",
      requiredTerms: ["talk", "to"],
      tags: ["restaurant", "customer service", "present continuous"],
      observation: "Một nhân viên phục vụ đang nói chuyện với khách hàng và cầm thực đơn.",
      frame: "The server is talking to a customer while holding a menu.",
      sampleAnswers: [
        { answer: "The server is talking to a customer while holding a menu.", translationVi: "Nhân viên phục vụ đang nói chuyện với khách hàng trong khi cầm thực đơn.", notes: "Dạng V + Prep: talk + to." },
        { answer: "A waiter is talking to a customer at the restaurant table.", translationVi: "Một bồi bàn đang nói chuyện với khách hàng tại bàn trong nhà hàng.", notes: "at the table bổ sung địa điểm." },
      ],
      planTemplate: ["Use talk.", "Add to before customer.", "Mention the menu or table."],
      topicKeywords: ["server", "customer", "menu", "restaurant", "table"],
    },
    {
      id: "p1-load-into-van",
      orderIndex: 210,
      part1Category: "V_PREP",
      title: "Loading into a van",
      titleVi: "Chất hàng vào xe giao hàng",
      summary: "Luyện dạng V + Prep với cụm load into trong giao nhận.",
      imageUrl: "/writing/delivery-packages.png",
      imageAlt: "A delivery worker loading packages into a van outside an office building.",
      requiredTerms: ["load", "into"],
      tags: ["delivery", "logistics", "present continuous"],
      observation: "Một nhân viên giao hàng đang chất các kiện hàng vào xe tải nhỏ.",
      frame: "The worker is loading packages into the delivery van.",
      sampleAnswers: [
        { answer: "The worker is loading packages into the delivery van.", translationVi: "Nhân viên đang chất các kiện hàng vào xe giao hàng.", notes: "Dạng V + Prep: load + into." },
        { answer: "A delivery worker is loading boxes into a van outside the building.", translationVi: "Một nhân viên giao hàng đang chất hộp vào xe tải nhỏ bên ngoài tòa nhà.", notes: "into chỉ hướng di chuyển vào trong." },
      ],
      planTemplate: ["Use load.", "Add into before the van.", "Mention the packages or boxes."],
      topicKeywords: ["worker", "packages", "van", "loading", "building"],
    },
    {
      id: "p1-work-on-report",
      orderIndex: 220,
      part1Category: "V_PREP",
      title: "Working on a report",
      titleVi: "Làm việc với báo cáo",
      summary: "Luyện dạng V + Prep với cụm work on trong văn phòng.",
      imageUrl: "/writing/office-report.png",
      imageAlt: "An office employee reading a printed report at a desk with a laptop.",
      requiredTerms: ["work", "on"],
      tags: ["office", "documents", "present continuous"],
      observation: "Một nhân viên đang đọc và xử lý báo cáo tại bàn làm việc.",
      frame: "The employee is working on a report at her desk.",
      sampleAnswers: [
        { answer: "The employee is working on a report at her desk.", translationVi: "Nhân viên đang làm việc với một báo cáo tại bàn của cô ấy.", notes: "Dạng V + Prep: work + on." },
        { answer: "A woman is working on a report beside her laptop.", translationVi: "Một phụ nữ đang xử lý báo cáo cạnh máy tính xách tay.", notes: "beside her laptop bổ sung bối cảnh." },
      ],
      planTemplate: ["Use work.", "Add on before report.", "Mention the desk or laptop."],
      topicKeywords: ["employee", "report", "desk", "laptop", "office"],
    },
    {
      id: "p1-stand-near-table",
      orderIndex: 230,
      part1Category: "V_PREP",
      title: "Standing near a table",
      titleVi: "Đứng gần bàn họp",
      summary: "Luyện dạng V + Prep với cụm stand near trong phòng họp.",
      imageUrl: "/writing/meeting-preparation.png",
      imageAlt: "A colleague arranging materials in a meeting room before a presentation.",
      requiredTerms: ["stand", "near"],
      tags: ["meeting", "office", "position"],
      observation: "Một người đang đứng gần bàn họp và chuẩn bị tài liệu.",
      frame: "The woman is standing near the conference table.",
      sampleAnswers: [
        { answer: "The woman is standing near the conference table.", translationVi: "Người phụ nữ đang đứng gần bàn họp.", notes: "Dạng V + Prep: stand + near." },
        { answer: "A woman is standing near the table while preparing materials.", translationVi: "Một phụ nữ đang đứng gần bàn trong khi chuẩn bị tài liệu.", notes: "while nối hai hành động liên quan." },
      ],
      planTemplate: ["Use stand.", "Add near before the table.", "Mention the materials if useful."],
      topicKeywords: ["woman", "table", "materials", "meeting", "room"],
    },
    {
      id: "p1-prepare-for-meeting",
      orderIndex: 240,
      part1Category: "V_PREP",
      title: "Preparing for a meeting",
      titleVi: "Chuẩn bị cho cuộc họp",
      summary: "Luyện dạng V + Prep với cụm prepare for trước buổi họp.",
      imageUrl: "/writing/meeting-preparation.png",
      imageAlt: "A colleague arranging materials in a meeting room before a presentation.",
      requiredTerms: ["prepare", "for"],
      tags: ["meeting", "office", "present continuous"],
      observation: "Một nhân viên đang chuẩn bị tài liệu cho cuộc họp sắp diễn ra.",
      frame: "The employee is preparing materials for the meeting.",
      sampleAnswers: [
        { answer: "The employee is preparing materials for the meeting.", translationVi: "Nhân viên đang chuẩn bị tài liệu cho cuộc họp.", notes: "Dạng V + Prep: prepare + for." },
        { answer: "A woman is preparing for a meeting in the conference room.", translationVi: "Một phụ nữ đang chuẩn bị cho cuộc họp trong phòng họp.", notes: "for a meeting bổ sung mục đích chuẩn bị." },
      ],
      planTemplate: ["Use prepare.", "Add for before the meeting.", "Mention the materials or room."],
      topicKeywords: ["employee", "materials", "meeting", "room", "presentation"],
    },
  ];

  return [...variants, ...createAdditionalPartOneVariants()].map(createPartOneSeed);
}

/**
 * Fifty more original picture drills. The groups deliberately remain close in
 * size (13 / 13 / 12 / 12) so the category filters stay useful for focused
 * practice instead of becoming a list dominated by one grammar pattern.
 */
function createAdditionalPartOneVariants(): PartOneSeedVariant[] {
  return [
    {
      id: "p1-expanded-01",
      orderIndex: 250,
      part1Category: "V_N",
      title: "Arranging shelf labels",
      titleVi: "Sắp xếp nhãn kệ hàng",
      summary: "Luyện dạng V + N khi nhân viên chuẩn bị nhãn cho khu trưng bày bán lẻ.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A retail clerk arranging labels on shelves in a bright store aisle.",
      requiredTerms: ["arrange", "labels"],
      tags: ["retail", "store", "present continuous"],
      observation: "Một nhân viên đang điều chỉnh các nhãn hàng trên dãy kệ trong cửa hàng.",
      frame: "The clerk is arranging labels on the shelves.",
      sampleAnswers: [originalSample("The clerk is arranging labels on the shelves.", "Nhân viên đang sắp xếp các nhãn trên kệ.", "Dùng V-ing + noun để mô tả hành động đang diễn ra.")],
      planTemplate: ["Name the clerk.", "Use arrange for the action.", "Add labels and the shelves."],
      topicKeywords: ["clerk", "labels", "shelves", "store", "products"],
    },
    {
      id: "p1-expanded-02",
      orderIndex: 260,
      part1Category: "V_N",
      title: "Stocking canned goods",
      titleVi: "Xếp hàng đóng hộp lên kệ",
      summary: "Luyện dạng V + N với hoạt động bổ sung hàng hóa trong siêu thị.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A store employee stocking canned goods on retail shelves.",
      requiredTerms: ["stock", "goods"],
      tags: ["retail", "inventory", "present continuous"],
      observation: "Một nhân viên đang đưa hàng đóng hộp lên các kệ của cửa hàng.",
      frame: "The employee is stocking goods on the store shelves.",
      sampleAnswers: [originalSample("The employee is stocking goods on the store shelves.", "Nhân viên đang xếp hàng hóa lên các kệ của cửa hàng.", "stock goods là cụm động từ và tân ngữ tự nhiên trong bán lẻ.")],
      planTemplate: ["Identify the employee.", "Use stock as the main verb.", "Add goods and the shelves."],
      topicKeywords: ["employee", "goods", "shelves", "store", "cans"],
    },
    {
      id: "p1-expanded-03",
      orderIndex: 270,
      part1Category: "V_N",
      title: "Checking price tags",
      titleVi: "Kiểm tra thẻ giá",
      summary: "Luyện dạng V + N khi kiểm tra thông tin giá trong cửa hàng.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A retail employee checking price tags beside stocked shelves.",
      requiredTerms: ["check", "tags"],
      tags: ["retail", "prices", "present continuous"],
      observation: "Nhân viên đang nhìn vào các thẻ giá cạnh sản phẩm trên kệ.",
      frame: "The employee is checking the price tags near the products.",
      sampleAnswers: [originalSample("The employee is checking the price tags near the products.", "Nhân viên đang kiểm tra các thẻ giá gần sản phẩm.", "Thêm price trước tags để làm câu rõ nghĩa hơn.")],
      planTemplate: ["Name the employee.", "Use check for the action.", "Mention the tags and products."],
      topicKeywords: ["employee", "price", "tags", "products", "shelves"],
    },
    {
      id: "p1-expanded-04",
      orderIndex: 280,
      part1Category: "V_N",
      title: "Scanning a barcode",
      titleVi: "Quét mã vạch",
      summary: "Luyện dạng V + N trong tình huống xử lý hàng hóa tại kho.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A warehouse worker scanning a barcode on a package.",
      requiredTerms: ["scan", "barcode"],
      tags: ["warehouse", "inventory", "present continuous"],
      observation: "Một nhân viên kho đang dùng thiết bị cầm tay để quét mã trên kiện hàng.",
      frame: "The worker is scanning a barcode on the package.",
      sampleAnswers: [originalSample("The worker is scanning a barcode on the package.", "Nhân viên đang quét mã vạch trên kiện hàng.", "scan + a barcode là cặp động từ và danh từ cần có trong câu.")],
      planTemplate: ["Identify the worker.", "Use scan as the action.", "Add barcode and package."],
      topicKeywords: ["worker", "barcode", "scanner", "package", "warehouse"],
    },
    {
      id: "p1-expanded-05",
      orderIndex: 290,
      part1Category: "V_N",
      title: "Moving a carton",
      titleVi: "Di chuyển thùng hàng",
      summary: "Luyện dạng V + N với hành động chuyển một thùng hàng trong kho.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A warehouse employee moving a carton near a scanning station.",
      requiredTerms: ["move", "carton"],
      tags: ["warehouse", "packages", "present continuous"],
      observation: "Nhân viên kho đang di chuyển một thùng carton gần khu vực quét hàng.",
      frame: "The warehouse employee is moving a carton toward the work area.",
      sampleAnswers: [originalSample("The warehouse employee is moving a carton toward the work area.", "Nhân viên kho đang di chuyển một thùng carton về phía khu làm việc.", "Dùng toward để bổ sung hướng di chuyển.")],
      planTemplate: ["Name the warehouse employee.", "Use move as the verb.", "Include the carton and a location."],
      topicKeywords: ["employee", "carton", "warehouse", "package", "work area"],
    },
    {
      id: "p1-expanded-06",
      orderIndex: 300,
      part1Category: "V_N",
      title: "Sorting parcels",
      titleVi: "Phân loại bưu kiện",
      summary: "Luyện dạng V + N với hoạt động phân loại các bưu kiện trước khi giao.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A warehouse worker sorting parcels beside a handheld scanner.",
      requiredTerms: ["sort", "parcels"],
      tags: ["warehouse", "logistics", "present continuous"],
      observation: "Nhân viên đang phân loại các bưu kiện tại khu đóng gói.",
      frame: "The worker is sorting parcels for delivery.",
      sampleAnswers: [originalSample("The worker is sorting parcels for delivery.", "Nhân viên đang phân loại các bưu kiện để giao hàng.", "for delivery nêu mục đích của công việc.")],
      planTemplate: ["Identify the worker.", "Use sort for the action.", "Add parcels and the delivery purpose."],
      topicKeywords: ["worker", "parcels", "warehouse", "scanner", "delivery"],
    },
    {
      id: "p1-expanded-07",
      orderIndex: 310,
      part1Category: "V_N",
      title: "Greeting a guest",
      titleVi: "Chào đón khách",
      summary: "Luyện dạng V + N cho tình huống chào đón khách tại quầy lễ tân.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A hotel receptionist greeting a guest at a reception desk.",
      requiredTerms: ["greet", "guest"],
      tags: ["hotel", "customer service", "present continuous"],
      observation: "Nhân viên lễ tân đang mỉm cười và chào một vị khách tại quầy khách sạn.",
      frame: "The receptionist is greeting a guest at the desk.",
      sampleAnswers: [originalSample("The receptionist is greeting a guest at the desk.", "Nhân viên lễ tân đang chào một vị khách tại quầy.", "greet + a guest tạo câu ngắn, lịch sự và sát với tranh.")],
      planTemplate: ["Name the receptionist.", "Use greet as the action.", "Add the guest and desk."],
      topicKeywords: ["receptionist", "guest", "hotel", "desk", "welcome"],
    },
    {
      id: "p1-expanded-08",
      orderIndex: 320,
      part1Category: "V_N",
      title: "Checking a reservation",
      titleVi: "Kiểm tra đặt phòng",
      summary: "Luyện dạng V + N với công việc xác nhận thông tin đặt phòng.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A receptionist checking a hotel reservation at a computer.",
      requiredTerms: ["check", "reservation"],
      tags: ["hotel", "booking", "present continuous"],
      observation: "Nhân viên lễ tân đang xem thông tin đặt phòng cho một khách đang chờ.",
      frame: "The receptionist is checking the guest's reservation.",
      sampleAnswers: [originalSample("The receptionist is checking the guest's reservation.", "Nhân viên lễ tân đang kiểm tra đặt phòng của khách.", "Dùng sở hữu cách guest's để nói rõ đặt phòng của ai.")],
      planTemplate: ["Identify the receptionist.", "Use check for the action.", "Include reservation and the guest."],
      topicKeywords: ["receptionist", "reservation", "guest", "hotel", "computer"],
    },
    {
      id: "p1-expanded-09",
      orderIndex: 330,
      part1Category: "V_N",
      title: "Answering the phone",
      titleVi: "Trả lời điện thoại",
      summary: "Luyện dạng V + N trong bối cảnh dịch vụ khách sạn.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A hotel receptionist answering the phone behind a front desk.",
      requiredTerms: ["answer", "phone"],
      tags: ["hotel", "phone", "customer service"],
      observation: "Một nhân viên lễ tân đang nghe điện thoại sau quầy tiếp đón.",
      frame: "The receptionist is answering the phone at the front desk.",
      sampleAnswers: [originalSample("The receptionist is answering the phone at the front desk.", "Nhân viên lễ tân đang trả lời điện thoại tại quầy trước.", "answer the phone là cụm từ thông dụng khi nói về cuộc gọi.")],
      planTemplate: ["Name the receptionist.", "Use answer as the action.", "Mention the phone and desk."],
      topicKeywords: ["receptionist", "phone", "desk", "hotel", "guest"],
    },
    {
      id: "p1-expanded-10",
      orderIndex: 340,
      part1Category: "V_N",
      title: "Watering the plants",
      titleVi: "Tưới cây",
      summary: "Luyện dạng V + N với công việc chăm sóc cây xanh ngoài trời.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "A gardener watering plants along a landscaped path.",
      requiredTerms: ["water", "plants"],
      tags: ["garden", "maintenance", "present continuous"],
      observation: "Người làm vườn đang tưới các cây bên cạnh lối đi.",
      frame: "The gardener is watering the plants along the path.",
      sampleAnswers: [originalSample("The gardener is watering the plants along the path.", "Người làm vườn đang tưới cây dọc theo lối đi.", "watering là dạng V-ing của water trong hiện tại tiếp diễn.")],
      planTemplate: ["Identify the gardener.", "Use water as the action.", "Add plants and the path."],
      topicKeywords: ["gardener", "plants", "path", "garden", "water"],
    },
    {
      id: "p1-expanded-11",
      orderIndex: 350,
      part1Category: "V_N",
      title: "Trimming bushes",
      titleVi: "Cắt tỉa bụi cây",
      summary: "Luyện dạng V + N với hoạt động bảo dưỡng cảnh quan.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "A gardener trimming bushes in a maintained garden.",
      requiredTerms: ["trim", "bushes"],
      tags: ["garden", "maintenance", "present continuous"],
      observation: "Người làm vườn đang cắt tỉa các bụi cây trong khuôn viên.",
      frame: "The gardener is trimming bushes near the walkway.",
      sampleAnswers: [originalSample("The gardener is trimming bushes near the walkway.", "Người làm vườn đang cắt tỉa bụi cây gần lối đi.", "near the walkway giúp bổ sung vị trí cụ thể.")],
      planTemplate: ["Name the gardener.", "Use trim as the action.", "Include bushes and the walkway."],
      topicKeywords: ["gardener", "bushes", "walkway", "garden", "tools"],
    },
    {
      id: "p1-expanded-12",
      orderIndex: 360,
      part1Category: "V_N",
      title: "Reviewing a blueprint",
      titleVi: "Xem bản vẽ kỹ thuật",
      summary: "Luyện dạng V + N khi đội xây dựng kiểm tra bản vẽ tại công trường.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "A construction supervisor reviewing a blueprint with workers.",
      requiredTerms: ["review", "blueprint"],
      tags: ["construction", "planning", "present continuous"],
      observation: "Một người giám sát đang xem bản vẽ cùng các công nhân tại công trường.",
      frame: "The supervisor is reviewing a blueprint with the crew.",
      sampleAnswers: [originalSample("The supervisor is reviewing a blueprint with the crew.", "Người giám sát đang xem bản vẽ cùng đội công nhân.", "with the crew giúp nêu những người cùng tham gia.")],
      planTemplate: ["Identify the supervisor.", "Use review as the action.", "Add blueprint and the crew."],
      topicKeywords: ["supervisor", "blueprint", "crew", "construction", "site"],
    },
    {
      id: "p1-expanded-13",
      orderIndex: 370,
      part1Category: "V_N",
      title: "Inspecting the site",
      titleVi: "Kiểm tra công trường",
      summary: "Luyện dạng V + N với hoạt động kiểm tra hiện trường xây dựng.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "A construction manager inspecting a work site during a briefing.",
      requiredTerms: ["inspect", "site"],
      tags: ["construction", "safety", "present continuous"],
      observation: "Quản lý công trường đang quan sát khu vực làm việc trước khi nhóm bắt đầu.",
      frame: "The manager is inspecting the construction site.",
      sampleAnswers: [originalSample("The manager is inspecting the construction site.", "Người quản lý đang kiểm tra công trường xây dựng.", "construction làm rõ loại site được nói đến.")],
      planTemplate: ["Name the manager.", "Use inspect as the action.", "Include the construction site."],
      topicKeywords: ["manager", "site", "construction", "workers", "helmets"],
    },
    {
      id: "p1-expanded-14",
      orderIndex: 380,
      part1Category: "N_N",
      title: "Shopper and basket",
      titleVi: "Khách mua hàng và giỏ hàng",
      summary: "Luyện dạng N + N với người mua sắm và vật dụng trong siêu thị.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A shopper holding a basket while looking at store shelves.",
      requiredTerms: ["shopper", "basket"],
      tags: ["retail", "shopping", "present continuous"],
      observation: "Một khách mua hàng đang cầm giỏ và xem các sản phẩm trên kệ.",
      frame: "The shopper is holding a basket near the shelves.",
      sampleAnswers: [originalSample("The shopper is holding a basket near the shelves.", "Khách mua hàng đang cầm một giỏ gần các kệ hàng.", "Cả shopper và basket đều xuất hiện tự nhiên trong một câu.")],
      planTemplate: ["Name the shopper.", "Include the basket.", "Add the shelves as context."],
      topicKeywords: ["shopper", "basket", "shelves", "store", "products"],
    },
    {
      id: "p1-expanded-15",
      orderIndex: 390,
      part1Category: "N_N",
      title: "Receipt and counter",
      titleVi: "Hóa đơn và quầy thanh toán",
      summary: "Luyện dạng N + N với hai đồ vật quen thuộc ở quầy bán lẻ.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A printed receipt resting on a retail checkout counter.",
      requiredTerms: ["receipt", "counter"],
      tags: ["retail", "checkout", "objects"],
      observation: "Một hóa đơn được đặt trên quầy thanh toán trong cửa hàng.",
      frame: "The receipt is on the counter beside the register.",
      sampleAnswers: [originalSample("The receipt is on the counter beside the register.", "Hóa đơn ở trên quầy cạnh máy tính tiền.", "Dùng is on để liên kết hai danh từ theo vị trí.")],
      planTemplate: ["Start with receipt.", "Include counter.", "Add the register if useful."],
      topicKeywords: ["receipt", "counter", "register", "store", "checkout"],
    },
    {
      id: "p1-expanded-16",
      orderIndex: 400,
      part1Category: "N_N",
      title: "Clerk and shelves",
      titleVi: "Nhân viên và các kệ hàng",
      summary: "Luyện dạng N + N khi mô tả một nhân viên làm việc cạnh kệ hàng.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A store clerk working beside neatly stocked shelves.",
      requiredTerms: ["clerk", "shelves"],
      tags: ["retail", "store", "present continuous"],
      observation: "Nhân viên cửa hàng đứng cạnh các kệ đầy sản phẩm.",
      frame: "The clerk is working beside the shelves.",
      sampleAnswers: [originalSample("The clerk is working beside the shelves.", "Nhân viên đang làm việc cạnh các kệ hàng.", "beside the shelves nêu vị trí rõ ràng cho clerk.")],
      planTemplate: ["Name the clerk.", "Include shelves.", "Describe a simple action or position."],
      topicKeywords: ["clerk", "shelves", "products", "store", "aisle"],
    },
    {
      id: "p1-expanded-17",
      orderIndex: 410,
      part1Category: "N_N",
      title: "Scanner and barcode",
      titleVi: "Máy quét và mã vạch",
      summary: "Luyện dạng N + N với thiết bị và thông tin nhận diện trong kho.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A handheld scanner pointed at a barcode on a warehouse package.",
      requiredTerms: ["scanner", "barcode"],
      tags: ["warehouse", "inventory", "equipment"],
      observation: "Thiết bị quét cầm tay đang hướng vào mã vạch trên một kiện hàng.",
      frame: "The scanner is reading the barcode on the package.",
      sampleAnswers: [originalSample("The scanner is reading the barcode on the package.", "Máy quét đang đọc mã vạch trên kiện hàng.", "Dùng scanner làm chủ ngữ cho câu mô tả thiết bị.")],
      planTemplate: ["Start with scanner.", "Include barcode.", "Add the package for context."],
      topicKeywords: ["scanner", "barcode", "package", "warehouse", "device"],
    },
    {
      id: "p1-expanded-18",
      orderIndex: 420,
      part1Category: "N_N",
      title: "Worker and pallet",
      titleVi: "Nhân viên và pa-lét hàng",
      summary: "Luyện dạng N + N với người làm kho và khu vực chứa hàng.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A warehouse worker standing beside a pallet of packages.",
      requiredTerms: ["worker", "pallet"],
      tags: ["warehouse", "logistics", "present continuous"],
      observation: "Một nhân viên kho đứng gần pa-lét chứa các kiện hàng.",
      frame: "The worker is standing beside the pallet of packages.",
      sampleAnswers: [originalSample("The worker is standing beside the pallet of packages.", "Nhân viên đang đứng cạnh pa-lét các kiện hàng.", "pallet of packages làm rõ vật được chất trên pa-lét.")],
      planTemplate: ["Name the worker.", "Include pallet.", "Mention the packages if useful."],
      topicKeywords: ["worker", "pallet", "packages", "warehouse", "boxes"],
    },
    {
      id: "p1-expanded-19",
      orderIndex: 430,
      part1Category: "N_N",
      title: "Carton and trolley",
      titleVi: "Thùng carton và xe đẩy",
      summary: "Luyện dạng N + N với hai vật dụng dùng để di chuyển hàng hóa.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A carton placed on a trolley in a warehouse aisle.",
      requiredTerms: ["carton", "trolley"],
      tags: ["warehouse", "equipment", "objects"],
      observation: "Một thùng carton được đặt trên xe đẩy tại lối đi của kho.",
      frame: "The carton is on the trolley in the warehouse.",
      sampleAnswers: [originalSample("The carton is on the trolley in the warehouse.", "Thùng carton ở trên xe đẩy trong kho.", "Câu dùng vị trí để liên kết carton và trolley.")],
      planTemplate: ["Start with carton.", "Include trolley.", "Add the warehouse location."],
      topicKeywords: ["carton", "trolley", "warehouse", "boxes", "aisle"],
    },
    {
      id: "p1-expanded-20",
      orderIndex: 440,
      part1Category: "N_N",
      title: "Guest and suitcase",
      titleVi: "Khách và va-li",
      summary: "Luyện dạng N + N với khách lưu trú và hành lý tại khách sạn.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A hotel guest standing with a suitcase near reception.",
      requiredTerms: ["guest", "suitcase"],
      tags: ["hotel", "travel", "present continuous"],
      observation: "Một vị khách đứng ở quầy lễ tân cùng chiếc va-li của mình.",
      frame: "The guest is standing with a suitcase near reception.",
      sampleAnswers: [originalSample("The guest is standing with a suitcase near reception.", "Vị khách đang đứng cùng va-li gần quầy lễ tân.", "with a suitcase là cách tự nhiên để nối guest và suitcase.")],
      planTemplate: ["Name the guest.", "Include the suitcase.", "Add the reception area."],
      topicKeywords: ["guest", "suitcase", "reception", "hotel", "desk"],
    },
    {
      id: "p1-expanded-21",
      orderIndex: 450,
      part1Category: "N_N",
      title: "Receptionist and key",
      titleVi: "Nhân viên lễ tân và chìa khóa",
      summary: "Luyện dạng N + N với nhân viên lễ tân trao chìa khóa phòng.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A receptionist holding a room key at a hotel front desk.",
      requiredTerms: ["receptionist", "key"],
      tags: ["hotel", "check-in", "customer service"],
      observation: "Nhân viên lễ tân đang cầm chìa khóa phòng ở quầy tiếp đón.",
      frame: "The receptionist is holding the room key for a guest.",
      sampleAnswers: [originalSample("The receptionist is holding the room key for a guest.", "Nhân viên lễ tân đang cầm chìa khóa phòng cho một vị khách.", "room key cụ thể hóa loại key trong tình huống khách sạn.")],
      planTemplate: ["Name the receptionist.", "Include the key.", "Mention the guest if helpful."],
      topicKeywords: ["receptionist", "key", "guest", "hotel", "desk"],
    },
    {
      id: "p1-expanded-22",
      orderIndex: 460,
      part1Category: "N_N",
      title: "Reservation and clipboard",
      titleVi: "Đặt phòng và bảng ghi chép",
      summary: "Luyện dạng N + N với tài liệu nghiệp vụ tại quầy lễ tân.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A reservation form and clipboard on a hotel reception counter.",
      requiredTerms: ["reservation", "clipboard"],
      tags: ["hotel", "booking", "documents"],
      observation: "Thông tin đặt phòng được đặt trên bảng ghi chép tại quầy tiếp đón.",
      frame: "The reservation is written on the clipboard at the desk.",
      sampleAnswers: [originalSample("The reservation is written on the clipboard at the desk.", "Thông tin đặt phòng được ghi trên bảng ghi chép tại quầy.", "Dùng bị động is written on khi tập trung vào tài liệu.")],
      planTemplate: ["Start with reservation.", "Include clipboard.", "Add the desk or reception."],
      topicKeywords: ["reservation", "clipboard", "reception", "hotel", "desk"],
    },
    {
      id: "p1-expanded-23",
      orderIndex: 470,
      part1Category: "N_N",
      title: "Gardener and tools",
      titleVi: "Người làm vườn và dụng cụ",
      summary: "Luyện dạng N + N với người lao động và dụng cụ chăm sóc cảnh quan.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "A gardener holding maintenance tools in a landscaped garden.",
      requiredTerms: ["gardener", "tools"],
      tags: ["garden", "maintenance", "present continuous"],
      observation: "Người làm vườn đang sử dụng các dụng cụ để chăm sóc khuôn viên.",
      frame: "The gardener is carrying tools through the garden.",
      sampleAnswers: [originalSample("The gardener is carrying tools through the garden.", "Người làm vườn đang mang dụng cụ đi qua khu vườn.", "through the garden thêm hướng di chuyển tự nhiên.")],
      planTemplate: ["Name the gardener.", "Include the tools.", "Add the garden setting."],
      topicKeywords: ["gardener", "tools", "garden", "path", "maintenance"],
    },
    {
      id: "p1-expanded-24",
      orderIndex: 480,
      part1Category: "N_N",
      title: "Flowers and path",
      titleVi: "Hoa và lối đi",
      summary: "Luyện dạng N + N với các chi tiết cảnh quan trong một khu vườn.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "Colorful flowers growing beside a garden path.",
      requiredTerms: ["flowers", "path"],
      tags: ["garden", "landscape", "objects"],
      observation: "Những khóm hoa mọc dọc theo một lối đi được chăm sóc sạch sẽ.",
      frame: "The flowers are growing beside the garden path.",
      sampleAnswers: [originalSample("The flowers are growing beside the garden path.", "Những bông hoa đang mọc bên cạnh lối đi trong vườn.", "beside the path diễn tả đúng vị trí của flowers.")],
      planTemplate: ["Start with flowers.", "Include the path.", "Use a position phrase."],
      topicKeywords: ["flowers", "path", "garden", "plants", "landscape"],
    },
    {
      id: "p1-expanded-25",
      orderIndex: 490,
      part1Category: "N_N",
      title: "Supervisor and helmet",
      titleVi: "Giám sát viên và mũ bảo hộ",
      summary: "Luyện dạng N + N với nhân sự và thiết bị an toàn tại công trường.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "A construction supervisor wearing a safety helmet during a briefing.",
      requiredTerms: ["supervisor", "helmet"],
      tags: ["construction", "safety", "present continuous"],
      observation: "Người giám sát đội mũ bảo hộ trong khi nói chuyện với nhóm công nhân.",
      frame: "The supervisor is wearing a helmet at the construction site.",
      sampleAnswers: [originalSample("The supervisor is wearing a helmet at the construction site.", "Người giám sát đang đội mũ bảo hộ tại công trường.", "wearing a helmet là cách mô tả thiết bị an toàn chính xác.")],
      planTemplate: ["Name the supervisor.", "Include the helmet.", "Add the construction site."],
      topicKeywords: ["supervisor", "helmet", "construction", "site", "workers"],
    },
    {
      id: "p1-expanded-26",
      orderIndex: 500,
      part1Category: "N_N",
      title: "Workers and blueprint",
      titleVi: "Công nhân và bản vẽ kỹ thuật",
      summary: "Luyện dạng N + N khi một nhóm công nhân thảo luận bản vẽ công trình.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "Construction workers looking at a blueprint during a site briefing.",
      requiredTerms: ["workers", "blueprint"],
      tags: ["construction", "planning", "present continuous"],
      observation: "Các công nhân đang xem một bản vẽ trong buổi trao đổi tại công trường.",
      frame: "The workers are discussing a blueprint at the site.",
      sampleAnswers: [originalSample("The workers are discussing a blueprint at the site.", "Các công nhân đang thảo luận một bản vẽ tại công trường.", "Dùng số nhiều workers are cho một nhóm người.")],
      planTemplate: ["Use workers as the subject.", "Include blueprint.", "Add the site context."],
      topicKeywords: ["workers", "blueprint", "site", "construction", "briefing"],
    },
    {
      id: "p1-expanded-27",
      orderIndex: 510,
      part1Category: "N_PREP",
      title: "Products on shelves",
      titleVi: "Sản phẩm trên kệ",
      summary: "Luyện dạng N + Prep với vị trí của sản phẩm trong cửa hàng.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "Rows of products displayed on retail shelves.",
      requiredTerms: ["products", "on"],
      tags: ["retail", "position", "store"],
      observation: "Nhiều sản phẩm được trưng bày trên các kệ hàng trong cửa hàng.",
      frame: "The products are on the shelves in the store.",
      sampleAnswers: [originalSample("The products are on the shelves in the store.", "Các sản phẩm ở trên kệ trong cửa hàng.", "on the shelves là cụm giới từ chỉ vị trí cần dùng.")],
      planTemplate: ["Start with products.", "Use on before the shelves.", "Add the store if useful."],
      topicKeywords: ["products", "shelves", "store", "retail", "aisle"],
    },
    {
      id: "p1-expanded-28",
      orderIndex: 520,
      part1Category: "N_PREP",
      title: "Cashier at the counter",
      titleVi: "Thu ngân tại quầy",
      summary: "Luyện dạng N + Prep khi mô tả vị trí làm việc của thu ngân.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A cashier working at a store checkout counter.",
      requiredTerms: ["cashier", "at"],
      tags: ["retail", "checkout", "position"],
      observation: "Một thu ngân đang làm việc tại quầy thanh toán trong cửa hàng.",
      frame: "The cashier is standing at the counter.",
      sampleAnswers: [originalSample("The cashier is standing at the counter.", "Thu ngân đang đứng tại quầy.", "at the counter chỉ đúng nơi làm việc của cashier.")],
      planTemplate: ["Name the cashier.", "Use at before the counter.", "Add an action if you want."],
      topicKeywords: ["cashier", "counter", "store", "checkout", "products"],
    },
    {
      id: "p1-expanded-29",
      orderIndex: 530,
      part1Category: "N_PREP",
      title: "Worker in the warehouse",
      titleVi: "Nhân viên trong kho",
      summary: "Luyện dạng N + Prep với địa điểm làm việc trong kho hàng.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A worker using a scanner in a warehouse.",
      requiredTerms: ["worker", "in"],
      tags: ["warehouse", "position", "inventory"],
      observation: "Một nhân viên đang sử dụng thiết bị quét trong khu vực kho.",
      frame: "The worker is using a scanner in the warehouse.",
      sampleAnswers: [originalSample("The worker is using a scanner in the warehouse.", "Nhân viên đang sử dụng máy quét trong kho.", "in the warehouse nêu địa điểm cho worker và hành động.")],
      planTemplate: ["Name the worker.", "Use in before warehouse.", "Mention the scanner or package."],
      topicKeywords: ["worker", "warehouse", "scanner", "package", "barcode"],
    },
    {
      id: "p1-expanded-30",
      orderIndex: 540,
      part1Category: "N_PREP",
      title: "Boxes beside a pallet",
      titleVi: "Các thùng hàng cạnh pa-lét",
      summary: "Luyện dạng N + Prep với vị trí của các thùng hàng trong kho.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "Boxes placed beside a pallet in a warehouse workspace.",
      requiredTerms: ["boxes", "beside"],
      tags: ["warehouse", "position", "objects"],
      observation: "Nhiều thùng hàng được đặt bên cạnh một pa-lét trong kho.",
      frame: "The boxes are beside the pallet in the warehouse.",
      sampleAnswers: [originalSample("The boxes are beside the pallet in the warehouse.", "Các thùng hàng ở bên cạnh pa-lét trong kho.", "beside the pallet diễn tả vị trí của boxes.")],
      planTemplate: ["Start with boxes.", "Use beside before pallet.", "Add the warehouse location."],
      topicKeywords: ["boxes", "pallet", "warehouse", "packages", "floor"],
    },
    {
      id: "p1-expanded-31",
      orderIndex: 550,
      part1Category: "N_PREP",
      title: "Guest at reception",
      titleVi: "Khách tại quầy lễ tân",
      summary: "Luyện dạng N + Prep với vị trí của khách trong khách sạn.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A guest waiting at a hotel reception desk.",
      requiredTerms: ["guest", "at"],
      tags: ["hotel", "position", "travel"],
      observation: "Một vị khách đang chờ tại quầy lễ tân của khách sạn.",
      frame: "The guest is waiting at the reception desk.",
      sampleAnswers: [originalSample("The guest is waiting at the reception desk.", "Vị khách đang chờ tại quầy lễ tân.", "at the reception desk nêu rõ nơi khách đứng chờ.")],
      planTemplate: ["Name the guest.", "Use at before the reception desk.", "Add a simple action."],
      topicKeywords: ["guest", "reception", "desk", "hotel", "waiting"],
    },
    {
      id: "p1-expanded-32",
      orderIndex: 560,
      part1Category: "N_PREP",
      title: "Luggage near the desk",
      titleVi: "Hành lý gần quầy",
      summary: "Luyện dạng N + Prep với vị trí của hành lý trong khu vực lễ tân.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "Hotel luggage resting near a reception desk.",
      requiredTerms: ["luggage", "near"],
      tags: ["hotel", "travel", "position"],
      observation: "Hành lý của khách được đặt gần quầy lễ tân.",
      frame: "The luggage is near the reception desk.",
      sampleAnswers: [originalSample("The luggage is near the reception desk.", "Hành lý ở gần quầy lễ tân.", "near the reception desk là cụm giới từ ngắn, chính xác.")],
      planTemplate: ["Start with luggage.", "Use near before the desk.", "Keep the sentence complete."],
      topicKeywords: ["luggage", "reception", "desk", "hotel", "guest"],
    },
    {
      id: "p1-expanded-33",
      orderIndex: 570,
      part1Category: "N_PREP",
      title: "Gardener in the garden",
      titleVi: "Người làm vườn trong vườn",
      summary: "Luyện dạng N + Prep với người lao động trong không gian ngoài trời.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "A gardener working in a landscaped garden.",
      requiredTerms: ["gardener", "in"],
      tags: ["garden", "position", "maintenance"],
      observation: "Một người làm vườn đang chăm sóc cây trong khu vườn.",
      frame: "The gardener is working in the garden.",
      sampleAnswers: [originalSample("The gardener is working in the garden.", "Người làm vườn đang làm việc trong vườn.", "in the garden cho biết địa điểm của hành động.")],
      planTemplate: ["Name the gardener.", "Use in before garden.", "Add an action such as watering."],
      topicKeywords: ["gardener", "garden", "plants", "path", "maintenance"],
    },
    {
      id: "p1-expanded-34",
      orderIndex: 580,
      part1Category: "N_PREP",
      title: "Plants along the path",
      titleVi: "Cây dọc lối đi",
      summary: "Luyện dạng N + Prep khi mô tả vị trí của cây trong cảnh quan.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "Green plants growing along a garden path.",
      requiredTerms: ["plants", "along"],
      tags: ["garden", "position", "landscape"],
      observation: "Những cây xanh mọc dọc theo lối đi trong khu vườn.",
      frame: "The plants are growing along the garden path.",
      sampleAnswers: [originalSample("The plants are growing along the garden path.", "Các cây đang mọc dọc theo lối đi trong vườn.", "along the path diễn tả vị trí kéo dài theo một đường.")],
      planTemplate: ["Start with plants.", "Use along before the path.", "Add garden for context."],
      topicKeywords: ["plants", "path", "garden", "landscape", "flowers"],
    },
    {
      id: "p1-expanded-35",
      orderIndex: 590,
      part1Category: "N_PREP",
      title: "Tools on the ground",
      titleVi: "Dụng cụ trên mặt đất",
      summary: "Luyện dạng N + Prep với vị trí của dụng cụ làm vườn.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "Garden maintenance tools placed on the ground near a path.",
      requiredTerms: ["tools", "on"],
      tags: ["garden", "position", "equipment"],
      observation: "Các dụng cụ làm vườn được đặt trên mặt đất gần lối đi.",
      frame: "The tools are on the ground near the path.",
      sampleAnswers: [originalSample("The tools are on the ground near the path.", "Các dụng cụ ở trên mặt đất gần lối đi.", "on the ground là cụm vị trí thông dụng.")],
      planTemplate: ["Start with tools.", "Use on before the ground.", "Add near the path if useful."],
      topicKeywords: ["tools", "ground", "path", "garden", "maintenance"],
    },
    {
      id: "p1-expanded-36",
      orderIndex: 600,
      part1Category: "N_PREP",
      title: "Supervisor at the site",
      titleVi: "Giám sát viên tại công trường",
      summary: "Luyện dạng N + Prep với vị trí của người giám sát xây dựng.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "A construction supervisor standing at a work site with a crew.",
      requiredTerms: ["supervisor", "at"],
      tags: ["construction", "position", "safety"],
      observation: "Người giám sát đang đứng tại công trường cùng đội công nhân.",
      frame: "The supervisor is speaking to the crew at the site.",
      sampleAnswers: [originalSample("The supervisor is speaking to the crew at the site.", "Người giám sát đang nói chuyện với đội công nhân tại công trường.", "at the site đặt hoạt động vào đúng bối cảnh xây dựng.")],
      planTemplate: ["Name the supervisor.", "Use at before the site.", "Mention the crew or briefing."],
      topicKeywords: ["supervisor", "site", "crew", "construction", "workers"],
    },
    {
      id: "p1-expanded-37",
      orderIndex: 610,
      part1Category: "N_PREP",
      title: "Helmets on the table",
      titleVi: "Mũ bảo hộ trên bàn",
      summary: "Luyện dạng N + Prep với dụng cụ an toàn được sắp xếp trước buổi họp công trường.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "Safety helmets placed on a table during a construction briefing.",
      requiredTerms: ["helmets", "on"],
      tags: ["construction", "safety", "position"],
      observation: "Một số mũ bảo hộ được đặt trên bàn gần bản vẽ kỹ thuật.",
      frame: "The helmets are on the table beside the blueprint.",
      sampleAnswers: [originalSample("The helmets are on the table beside the blueprint.", "Các mũ bảo hộ ở trên bàn cạnh bản vẽ.", "Dùng số nhiều helmets are để phù hợp với nhiều chiếc mũ.")],
      planTemplate: ["Start with helmets.", "Use on before the table.", "Add the blueprint if helpful."],
      topicKeywords: ["helmets", "table", "blueprint", "construction", "safety"],
    },
    {
      id: "p1-expanded-38",
      orderIndex: 620,
      part1Category: "N_PREP",
      title: "Clipboard near the entrance",
      titleVi: "Bảng ghi chép gần lối vào",
      summary: "Luyện dạng N + Prep với vị trí của tài liệu kiểm tra tại công trường.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "A clipboard near the entrance to a construction work area.",
      requiredTerms: ["clipboard", "near"],
      tags: ["construction", "documents", "position"],
      observation: "Một bảng ghi chép được để gần lối vào khu vực thi công.",
      frame: "The clipboard is near the entrance to the work area.",
      sampleAnswers: [originalSample("The clipboard is near the entrance to the work area.", "Bảng ghi chép ở gần lối vào khu vực làm việc.", "near the entrance giúp diễn tả vị trí một cách rõ ràng.")],
      planTemplate: ["Start with clipboard.", "Use near before entrance.", "Add the work area."],
      topicKeywords: ["clipboard", "entrance", "work area", "construction", "site"],
    },
    {
      id: "p1-expanded-39",
      orderIndex: 630,
      part1Category: "V_PREP",
      title: "Looking at labels",
      titleVi: "Nhìn vào nhãn hàng",
      summary: "Luyện dạng V + Prep với cụm look at khi mua sắm.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A shopper looking at labels on products in a store aisle.",
      requiredTerms: ["look", "at"],
      tags: ["retail", "shopping", "present continuous"],
      observation: "Khách mua hàng đang nhìn vào các nhãn trên sản phẩm.",
      frame: "The shopper is looking at the labels on the products.",
      sampleAnswers: [originalSample("The shopper is looking at the labels on the products.", "Khách mua hàng đang nhìn vào các nhãn trên sản phẩm.", "look at luôn đi cùng giới từ at khi chỉ vật đang quan sát.")],
      planTemplate: ["Name the shopper.", "Use look at together.", "Add labels and products."],
      topicKeywords: ["shopper", "labels", "products", "shelves", "store"],
    },
    {
      id: "p1-expanded-40",
      orderIndex: 640,
      part1Category: "V_PREP",
      title: "Reaching for a product",
      titleVi: "Với lấy một sản phẩm",
      summary: "Luyện dạng V + Prep với cụm reach for trong cửa hàng.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A shopper reaching for a product from a high retail shelf.",
      requiredTerms: ["reach", "for"],
      tags: ["retail", "shopping", "present continuous"],
      observation: "Một khách mua hàng đang với lấy sản phẩm từ kệ.",
      frame: "The shopper is reaching for a product on the shelf.",
      sampleAnswers: [originalSample("The shopper is reaching for a product on the shelf.", "Khách mua hàng đang với lấy một sản phẩm trên kệ.", "reach for diễn tả hành động với tới vật mình muốn lấy.")],
      planTemplate: ["Name the shopper.", "Use reach for together.", "Add a product and shelf."],
      topicKeywords: ["shopper", "product", "shelf", "store", "reaching"],
    },
    {
      id: "p1-expanded-41",
      orderIndex: 650,
      part1Category: "V_PREP",
      title: "Scanning at the station",
      titleVi: "Quét hàng tại trạm xử lý",
      summary: "Luyện dạng V + Prep với hành động quét hàng tại một vị trí cụ thể.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A warehouse worker scanning a package at a processing station.",
      requiredTerms: ["scan", "at"],
      tags: ["warehouse", "inventory", "present continuous"],
      observation: "Một nhân viên đang quét kiện hàng tại trạm xử lý trong kho.",
      frame: "The worker is scanning a package at the station.",
      sampleAnswers: [originalSample("The worker is scanning a package at the station.", "Nhân viên đang quét một kiện hàng tại trạm xử lý.", "at the station nêu nơi hành động scan diễn ra.")],
      planTemplate: ["Name the worker.", "Use scan as the action.", "Use at before station."],
      topicKeywords: ["worker", "scanning", "package", "station", "warehouse"],
    },
    {
      id: "p1-expanded-42",
      orderIndex: 660,
      part1Category: "V_PREP",
      title: "Moving into storage",
      titleVi: "Di chuyển vào khu lưu trữ",
      summary: "Luyện dạng V + Prep với cụm move into khi đưa hàng vào kho.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A warehouse worker moving boxes into a storage area.",
      requiredTerms: ["move", "into"],
      tags: ["warehouse", "logistics", "present continuous"],
      observation: "Nhân viên kho đang di chuyển các thùng hàng vào khu lưu trữ.",
      frame: "The worker is moving boxes into the storage area.",
      sampleAnswers: [originalSample("The worker is moving boxes into the storage area.", "Nhân viên đang di chuyển các thùng hàng vào khu lưu trữ.", "into nhấn mạnh hướng di chuyển vào bên trong.")],
      planTemplate: ["Name the worker.", "Use move into together.", "Include boxes and storage area."],
      topicKeywords: ["worker", "boxes", "storage", "warehouse", "moving"],
    },
    {
      id: "p1-expanded-43",
      orderIndex: 670,
      part1Category: "V_PREP",
      title: "Checking in at a hotel",
      titleVi: "Làm thủ tục nhận phòng",
      summary: "Luyện dạng V + Prep với cụm check in tại quầy khách sạn.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A hotel guest checking in with a receptionist.",
      requiredTerms: ["check", "in"],
      tags: ["hotel", "travel", "present continuous"],
      observation: "Một vị khách đang làm thủ tục nhận phòng với nhân viên lễ tân.",
      frame: "The guest is checking in at the hotel reception.",
      sampleAnswers: [originalSample("The guest is checking in at the hotel reception.", "Vị khách đang làm thủ tục nhận phòng tại quầy lễ tân khách sạn.", "check in là cụm động từ dùng khi nhận phòng hoặc đăng ký đến.")],
      planTemplate: ["Name the guest.", "Use check in together.", "Add the hotel reception."],
      topicKeywords: ["guest", "checking in", "reception", "hotel", "desk"],
    },
    {
      id: "p1-expanded-44",
      orderIndex: 680,
      part1Category: "V_PREP",
      title: "Speaking to a guest",
      titleVi: "Nói chuyện với khách",
      summary: "Luyện dạng V + Prep với cụm speak to trong dịch vụ khách sạn.",
      imageUrl: "/writing/hotel-reception.png",
      imageAlt: "A hotel receptionist speaking to a guest across the desk.",
      requiredTerms: ["speak", "to"],
      tags: ["hotel", "customer service", "present continuous"],
      observation: "Nhân viên lễ tân đang nói chuyện với một vị khách qua quầy tiếp đón.",
      frame: "The receptionist is speaking to a guest at the desk.",
      sampleAnswers: [originalSample("The receptionist is speaking to a guest at the desk.", "Nhân viên lễ tân đang nói chuyện với một vị khách tại quầy.", "speak to + person là cấu trúc phù hợp với tình huống giao tiếp.")],
      planTemplate: ["Name the receptionist.", "Use speak to together.", "Include the guest and desk."],
      topicKeywords: ["receptionist", "guest", "desk", "hotel", "speaking"],
    },
    {
      id: "p1-expanded-45",
      orderIndex: 690,
      part1Category: "V_PREP",
      title: "Walking along the path",
      titleVi: "Đi dọc theo lối đi",
      summary: "Luyện dạng V + Prep với cụm walk along trong khu vườn.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "A gardener walking along a path through a landscaped garden.",
      requiredTerms: ["walk", "along"],
      tags: ["garden", "movement", "present continuous"],
      observation: "Người làm vườn đang đi dọc theo lối đi giữa các luống cây.",
      frame: "The gardener is walking along the garden path.",
      sampleAnswers: [originalSample("The gardener is walking along the garden path.", "Người làm vườn đang đi dọc theo lối đi trong vườn.", "walk along diễn tả chuyển động theo chiều dài của lối đi.")],
      planTemplate: ["Name the gardener.", "Use walk along together.", "Include the garden path."],
      topicKeywords: ["gardener", "walking", "path", "garden", "plants"],
    },
    {
      id: "p1-expanded-46",
      orderIndex: 700,
      part1Category: "V_PREP",
      title: "Working in the garden",
      titleVi: "Làm việc trong vườn",
      summary: "Luyện dạng V + Prep với cụm work in khi nói về địa điểm làm việc.",
      imageUrl: "/writing/garden-maintenance.png",
      imageAlt: "A gardener working in a garden surrounded by plants.",
      requiredTerms: ["work", "in"],
      tags: ["garden", "maintenance", "present continuous"],
      observation: "Người làm vườn đang thực hiện công việc bảo dưỡng trong vườn.",
      frame: "The gardener is working in the garden near the plants.",
      sampleAnswers: [originalSample("The gardener is working in the garden near the plants.", "Người làm vườn đang làm việc trong vườn gần các cây.", "work in + place dùng để nói nơi một người đang làm việc.")],
      planTemplate: ["Name the gardener.", "Use work in together.", "Add the plants or path."],
      topicKeywords: ["gardener", "working", "garden", "plants", "path"],
    },
    {
      id: "p1-expanded-47",
      orderIndex: 710,
      part1Category: "V_PREP",
      title: "Pointing at a plan",
      titleVi: "Chỉ vào bản kế hoạch",
      summary: "Luyện dạng V + Prep với cụm point at trong cuộc trao đổi công trường.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "A construction supervisor pointing at a plan during a briefing.",
      requiredTerms: ["point", "at"],
      tags: ["construction", "briefing", "present continuous"],
      observation: "Người giám sát đang chỉ vào bản kế hoạch khi trao đổi với đội công nhân.",
      frame: "The supervisor is pointing at the plan during the briefing.",
      sampleAnswers: [originalSample("The supervisor is pointing at the plan during the briefing.", "Người giám sát đang chỉ vào bản kế hoạch trong buổi trao đổi.", "point at dùng khi ngón tay hoặc vật chỉ hướng về một đối tượng.")],
      planTemplate: ["Name the supervisor.", "Use point at together.", "Add the plan and briefing."],
      topicKeywords: ["supervisor", "plan", "briefing", "construction", "workers"],
    },
    {
      id: "p1-expanded-48",
      orderIndex: 720,
      part1Category: "V_PREP",
      title: "Talking about a blueprint",
      titleVi: "Trao đổi về bản vẽ",
      summary: "Luyện dạng V + Prep với cụm talk about trong buổi họp xây dựng.",
      imageUrl: "/writing/construction-briefing.png",
      imageAlt: "Construction workers talking about a blueprint together.",
      requiredTerms: ["talk", "about"],
      tags: ["construction", "planning", "present continuous"],
      observation: "Các công nhân đang trao đổi về một bản vẽ kỹ thuật tại công trường.",
      frame: "The workers are talking about the blueprint at the site.",
      sampleAnswers: [originalSample("The workers are talking about the blueprint at the site.", "Các công nhân đang nói về bản vẽ tại công trường.", "talk about + topic dùng để nêu nội dung cuộc trò chuyện.")],
      planTemplate: ["Use workers as the subject.", "Use talk about together.", "Include the blueprint."],
      topicKeywords: ["workers", "blueprint", "site", "construction", "talking"],
    },
    {
      id: "p1-expanded-49",
      orderIndex: 730,
      part1Category: "V_PREP",
      title: "Placing items on a shelf",
      titleVi: "Đặt sản phẩm lên kệ",
      summary: "Luyện dạng V + Prep với cụm place on khi sắp xếp hàng hóa bán lẻ.",
      imageUrl: "/writing/retail-shelves.png",
      imageAlt: "A store clerk placing items on a retail shelf.",
      requiredTerms: ["place", "on"],
      tags: ["retail", "inventory", "present continuous"],
      observation: "Một nhân viên đang đặt các sản phẩm lên kệ trong cửa hàng.",
      frame: "The clerk is placing items on the shelf.",
      sampleAnswers: [originalSample("The clerk is placing items on the shelf.", "Nhân viên đang đặt các sản phẩm lên kệ.", "place + object + on + surface là trật tự từ cần chú ý.")],
      planTemplate: ["Name the clerk.", "Use place and on.", "Include items and shelf."],
      topicKeywords: ["clerk", "items", "shelf", "store", "products"],
    },
    {
      id: "p1-expanded-50",
      orderIndex: 740,
      part1Category: "V_PREP",
      title: "Loading onto a pallet",
      titleVi: "Chất hàng lên pa-lét",
      summary: "Luyện dạng V + Prep với cụm load onto trong công việc kho vận.",
      imageUrl: "/writing/warehouse-scanner.png",
      imageAlt: "A warehouse worker loading a carton onto a pallet.",
      requiredTerms: ["load", "onto"],
      tags: ["warehouse", "logistics", "present continuous"],
      observation: "Một nhân viên đang chất thùng carton lên pa-lét trong kho.",
      frame: "The worker is loading a carton onto the pallet.",
      sampleAnswers: [originalSample("The worker is loading a carton onto the pallet.", "Nhân viên đang chất một thùng carton lên pa-lét.", "onto cho biết hàng được di chuyển lên bề mặt của pa-lét.")],
      planTemplate: ["Name the worker.", "Use load onto together.", "Include carton and pallet."],
      topicKeywords: ["worker", "carton", "pallet", "warehouse", "loading"],
    },
  ];
}

function createPartOneSeed(variant: PartOneSeedVariant): WritingPromptRecord {
  const categoryLabel = WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS[variant.part1Category];
  return createSeed({
    id: variant.id,
    orderIndex: variant.orderIndex,
    part: 1,
    part1Category: variant.part1Category,
    title: variant.title,
    titleVi: variant.titleVi,
    summary: variant.summary,
    promptText: `Write ONE sentence based on the picture. Use BOTH words or phrases below. This exercise practises the ${categoryLabel} pattern.`,
    imageUrl: variant.imageUrl,
    imageAlt: variant.imageAlt,
    requiredTerms: variant.requiredTerms,
    tags: [...new Set([...variant.tags, categoryLabel])],
    difficulty: "BEGINNER",
    taskChecklist: [
      "Viết đúng một câu hoàn chỉnh.",
      `Dùng cả ${variant.requiredTerms[0]} và ${variant.requiredTerms[1]}.`,
      `Luyện đúng dạng ${categoryLabel}.`,
    ],
    hints: [
      { level: 1, title: "Quan sát tranh", body: variant.observation },
      { level: 2, title: `Khung câu ${categoryLabel}`, body: variant.frame },
    ],
    sampleAnswers: variant.sampleAnswers,
    planTemplate: variant.planTemplate,
    gradingTargets: {
      topicKeywords: variant.topicKeywords,
      requiredIdeas: [...variant.requiredTerms],
    },
  });
}

/** Twenty original workplace-email scenarios beyond the first curated set. */
function createExpandedPartTwoSeeds(): WritingPromptRecord[] {
  const variants: PartTwoSeedVariant[] = [
    {
      id: "p2-expanded-01",
      orderIndex: 150,
      title: "Invoice correction request",
      titleVi: "Yêu cầu chỉnh sửa hóa đơn",
      summary: "Phản hồi khách hàng phát hiện số tiền thuế chưa chính xác trên hóa đơn.",
      promptText: "Write an email response. Acknowledge the invoice concern, explain how you will verify it, and give a clear time for the corrected document.",
      tags: ["email", "billing", "customer service"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Riley Cooper",
        toName: "Billing Support",
        subject: "Incorrect tax amount on invoice 7124",
        body: "Hello,\n\nWe received invoice 7124 today and noticed that the tax amount appears higher than the amount in our purchase order. Could you please review it and send a corrected invoice if needed?\n\nThank you,",
        signature: "Riley Cooper",
      },
      taskChecklist: ["Xác nhận đã nhận được số hóa đơn và vấn đề.", "Nêu cách kiểm tra mà không khẳng định lỗi khi chưa xác minh.", "Cam kết thời gian gửi cập nhật hoặc hóa đơn sửa.", "Giữ giọng điệu lịch sự, chuyên nghiệp."],
      hints: [
        { level: 1, title: "Đặt kỳ vọng rõ ràng", body: "Nhắc đúng số hóa đơn, nói bạn sẽ đối chiếu purchase order và nêu thời điểm phản hồi." },
        { level: 2, title: "Cụm hữu ích", body: "We will compare the invoice with the purchase order. / We will send a corrected copy by..." },
      ],
      sampleAnswer: originalSample("Dear Ms. Cooper,\n\nThank you for bringing the tax amount on invoice 7124 to our attention. We will compare the invoice with your purchase order and confirm whether an adjustment is required. If a correction is needed, we will issue a revised invoice by 3:00 p.m. tomorrow. We will also let you know immediately if we need any additional documentation from your team.\n\nKind regards,\nBilling Support", "Kính gửi bà Cooper,\n\nCảm ơn bà đã thông báo về số tiền thuế trên hóa đơn 7124...", "Không thừa nhận lỗi trước khi kiểm tra; nêu rõ nguồn đối chiếu và mốc phản hồi."),
      planTemplate: ["Greet the sender and name the invoice.", "Acknowledge the concern without guessing the cause.", "Explain the verification step.", "Give a specific update time and close politely."],
      topicKeywords: ["invoice", "tax", "purchase order", "corrected", "billing"],
      requiredIdeas: ["acknowledge concern", "verify invoice", "update time"],
    },
    {
      id: "p2-expanded-02",
      orderIndex: 160,
      title: "Appointment rescheduling",
      titleVi: "Đổi lịch hẹn",
      summary: "Trả lời yêu cầu chuyển một buổi tư vấn sang thời gian khác.",
      promptText: "Write an email response. Confirm the rescheduling request, offer realistic alternative times, and explain how the appointment will be updated.",
      tags: ["email", "scheduling", "appointments"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Sara Lee",
        toName: "Client Scheduling",
        subject: "Request to move Thursday consultation",
        body: "Hello,\n\nI have a consultation scheduled for Thursday at 2:00 p.m., but a work meeting has been added at that time. Is it possible to move my appointment to Friday morning or next Monday afternoon?\n\nBest regards,",
        signature: "Sara Lee",
      },
      taskChecklist: ["Xác nhận yêu cầu đổi lịch.", "Đưa ra ít nhất một lựa chọn thời gian thực tế.", "Yêu cầu người gửi chọn thời gian nếu cần.", "Nói rõ khi nào lịch hẹn mới được xác nhận."],
      hints: [
        { level: 1, title: "Không hứa quá sớm", body: "Hãy nêu các khung giờ có thể cung cấp thay vì nói chắc mọi thời điểm đều trống." },
        { level: 2, title: "Cụm hữu ích", body: "Friday at 10:30 a.m. is available. / Please let us know which option you prefer." },
      ],
      sampleAnswer: originalSample("Dear Ms. Lee,\n\nWe can help you reschedule your Thursday consultation. Friday at 10:30 a.m. and Monday at 3:30 p.m. are currently available. Please reply with the option that works best for you, and we will update the appointment as soon as we receive your confirmation. If neither time is suitable, we can check additional openings later next week.\n\nBest regards,\nClient Scheduling", "Kính gửi bà Lee,\n\nChúng tôi có thể hỗ trợ đổi lịch buổi tư vấn vào thứ Năm...", "Đưa lựa chọn cụ thể và yêu cầu xác nhận trước khi đổi lịch trên hệ thống."),
      planTemplate: ["Acknowledge the current appointment.", "Offer specific alternatives.", "Ask the client to choose one.", "Explain the confirmation step."],
      topicKeywords: ["appointment", "Thursday", "Friday", "Monday", "reschedule"],
      requiredIdeas: ["confirm request", "alternative times", "confirmation step"],
    },
    {
      id: "p2-expanded-03",
      orderIndex: 170,
      title: "Printer repair update",
      titleVi: "Cập nhật sửa máy in",
      summary: "Phản hồi nhân viên báo máy in chung không thể sử dụng.",
      promptText: "Write an email response. Acknowledge the equipment issue, describe the immediate support available, and provide a careful repair update.",
      tags: ["email", "office", "maintenance"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "David Park",
        toName: "Office Services",
        subject: "Printer on the third floor is unavailable",
        body: "Hi,\n\nThe printer near the third-floor meeting rooms has been showing an error message since this morning. Our team needs to print handouts before a 4:00 p.m. session. Could someone take a look?\n\nThanks,",
        signature: "David",
      },
      taskChecklist: ["Xác nhận máy in và thời điểm người gửi cần tài liệu.", "Nêu phương án in tạm thời phù hợp.", "Mô tả trạng thái kỹ thuật một cách thận trọng.", "Cho biết khi nào sẽ cập nhật tiếp."],
      hints: [
        { level: 1, title: "Ưu tiên nhu cầu khẩn", body: "Hãy đề xuất một máy in thay thế hoặc hỗ trợ in trước, rồi mới nói về sửa chữa." },
        { level: 2, title: "Cụm hữu ích", body: "You may use the printer in... / A technician is checking the error message. / We will update you by..." },
      ],
      sampleAnswer: originalSample("Dear David,\n\nThank you for reporting the problem with the third-floor printer. While a technician checks the error message, your team may use the printer in the second-floor copy room for the 4:00 p.m. handouts. We have marked the repair as urgent and will send you an update by 2:30 p.m. If you need help printing the files, please reply with the document name.\n\nRegards,\nOffice Services", "Kính gửi David,\n\nCảm ơn bạn đã báo sự cố với máy in tầng ba...", "Đáp án tốt xử lý nhu cầu in gấp và không đoán nguyên nhân kỹ thuật."),
      planTemplate: ["Acknowledge the printer issue.", "Offer a temporary printing option.", "State the repair action carefully.", "Give an update time and close."],
      topicKeywords: ["printer", "third floor", "handouts", "technician", "update"],
      requiredIdeas: ["acknowledge issue", "temporary option", "repair update"],
    },
    {
      id: "p2-expanded-04",
      orderIndex: 180,
      title: "Missing item in an order",
      titleVi: "Thiếu sản phẩm trong đơn hàng",
      summary: "Trả lời khách hàng nhận được đơn hàng nhưng thiếu một sản phẩm.",
      promptText: "Write an email response. Apologize for the incomplete order, verify the missing item, and explain the replacement or investigation step.",
      tags: ["email", "orders", "customer service"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Mina Santos",
        toName: "Fulfillment Team",
        subject: "One item is missing from my order",
        body: "Hello,\n\nMy package arrived today, but the wireless mouse listed on the packing slip was not inside the box. The keyboard and cable were included. Please let me know what I should do next.\n\nThank you,",
        signature: "Mina Santos",
      },
      taskChecklist: ["Xin lỗi về trải nghiệm nhận hàng chưa đầy đủ.", "Nhắc lại sản phẩm bị thiếu để xác nhận.", "Nêu bước kiểm tra hoặc gửi thay thế.", "Đưa ra mốc thời gian hoặc thông tin theo dõi."],
      hints: [
        { level: 1, title: "Xác nhận chi tiết", body: "Đừng yêu cầu khách lặp lại toàn bộ email; hãy nhắc wireless mouse và số đơn nếu có." },
        { level: 2, title: "Cụm hữu ích", body: "We are sorry the wireless mouse was not included. / We will review the packing record and..." },
      ],
      sampleAnswer: originalSample("Dear Ms. Santos,\n\nWe are sorry that the wireless mouse was not included in your package. We will review the packing record for your order today. If the item was omitted, we will send a replacement at no additional cost and email you the tracking number within one business day. You do not need to return the keyboard or cable.\n\nSincerely,\nFulfillment Team", "Kính gửi bà Santos,\n\nChúng tôi xin lỗi vì chuột không dây không có trong kiện hàng...", "Nêu rõ vật bị thiếu, bước xác minh và lựa chọn thay thế để khách biết điều gì xảy ra tiếp theo."),
      planTemplate: ["Apologize and identify the missing item.", "Explain the record check.", "Offer a concrete next step.", "State timing or tracking information."],
      topicKeywords: ["wireless mouse", "package", "packing", "replacement", "tracking"],
      requiredIdeas: ["apology", "missing item", "investigation or replacement", "next step"],
    },
    {
      id: "p2-expanded-05",
      orderIndex: 190,
      title: "Conference registration change",
      titleVi: "Thay đổi đăng ký hội nghị",
      summary: "Phản hồi yêu cầu đổi tên người tham dự cho một hội nghị.",
      promptText: "Write an email response. Explain the registration-change process, request any essential detail, and confirm what will happen after the update.",
      tags: ["email", "events", "registration"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Owen Brooks",
        toName: "Events Desk",
        subject: "Change attendee name for design conference",
        body: "Hello,\n\nOne of our colleagues can no longer attend the design conference next month. May we transfer her registration to another employee from the same company? Please let me know what information you need.\n\nRegards,",
        signature: "Owen Brooks",
      },
      taskChecklist: ["Xác nhận có thể xem xét yêu cầu chuyển đăng ký.", "Nêu thông tin cần thiết như mã đăng ký và tên mới.", "Giải thích điều kiện hoặc hạn chót nếu phù hợp.", "Nói rõ email xác nhận sẽ được gửi sau khi cập nhật."],
      hints: [
        { level: 1, title: "Tránh tự đặt chính sách", body: "Chỉ nêu điều kiện bạn có thể hỗ trợ, ví dụ cùng công ty và trước hạn thay đổi." },
        { level: 2, title: "Cụm hữu ích", body: "Please send the registration number and the new attendee's full name. / We will confirm the transfer by email." },
      ],
      sampleAnswer: originalSample("Dear Mr. Brooks,\n\nWe can review a transfer of the conference registration to another employee from your company. Please send the registration number, the original attendee's name, and the new attendee's full name and email address. Requests received before September 10 can normally be processed without a fee. Once the record is updated, we will send a confirmation message to both attendees.\n\nBest regards,\nEvents Desk", "Kính gửi ông Brooks,\n\nChúng tôi có thể xem xét chuyển đăng ký hội nghị sang một nhân viên khác...", "Liệt kê dữ liệu cần có, điều kiện thời gian và kết quả sau khi xử lý."),
      planTemplate: ["Acknowledge the transfer request.", "Ask for the necessary registration details.", "State a relevant condition or deadline.", "Explain the confirmation outcome."],
      topicKeywords: ["registration", "attendee", "conference", "transfer", "confirmation"],
      requiredIdeas: ["process", "required details", "condition", "confirmation"],
    },
    {
      id: "p2-expanded-06",
      orderIndex: 200,
      title: "Visitor parking access",
      titleVi: "Thẻ đỗ xe cho khách",
      summary: "Phản hồi yêu cầu sắp xếp chỗ đỗ xe cho khách đến văn phòng.",
      promptText: "Write an email response. Confirm the parking option, ask for the vehicle information needed, and explain the arrival procedure.",
      tags: ["email", "facilities", "visitors"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Yuki Tan",
        toName: "Building Access",
        subject: "Parking pass for visiting client",
        body: "Hi,\n\nA client will visit our office on Tuesday at 11:00 a.m. and plans to drive. Could we arrange a visitor parking pass for her? She will be here for about two hours.\n\nThanks,",
        signature: "Yuki",
      },
      taskChecklist: ["Xác nhận lựa chọn đỗ xe hoặc tình trạng chỗ trống.", "Hỏi biển số xe hoặc tên khách nếu cần.", "Nêu nơi khách lấy hoặc hiển thị thẻ.", "Giữ thông tin ngắn gọn, dễ thực hiện."],
      hints: [
        { level: 1, title: "Nêu quy trình đến", body: "Một email hữu ích cần nói khách vào đâu, làm gì khi đến và mang theo thông tin nào." },
        { level: 2, title: "Cụm hữu ích", body: "Please send the vehicle license plate. / The pass will be available at the security desk." },
      ],
      sampleAnswer: originalSample("Dear Yuki,\n\nVisitor parking is available for your client on Tuesday at 11:00 a.m. Please send us her full name and vehicle license plate by Monday afternoon so that we can register the pass. When she arrives, she should enter through the south gate and collect the pass from the security desk. The pass will be valid for the two-hour visit.\n\nRegards,\nBuilding Access", "Kính gửi Yuki,\n\nChỗ đỗ xe cho khách có sẵn vào thứ Ba lúc 11 giờ...", "Nêu rõ dữ liệu cần cung cấp và từng bước khi khách đến tòa nhà."),
      planTemplate: ["Confirm the parking option.", "Request required vehicle or visitor details.", "Describe arrival and pass collection.", "State the pass validity."],
      topicKeywords: ["visitor", "parking", "license plate", "security desk", "Tuesday"],
      requiredIdeas: ["availability", "vehicle details", "arrival procedure"],
    },
    {
      id: "p2-expanded-07",
      orderIndex: 210,
      title: "Product return request",
      titleVi: "Yêu cầu trả sản phẩm",
      summary: "Hướng dẫn khách trả lại một tai nghe chưa mở hộp.",
      promptText: "Write an email response. Confirm the return eligibility, give the return steps, and state the expected refund timing.",
      tags: ["email", "returns", "customer service"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Maria Chen",
        toName: "Returns Team",
        subject: "Returning an unopened headset",
        body: "Hello,\n\nI ordered a headset last week, but my company has now provided one for me. The box is still unopened. Can I return it, and how long will the refund take?\n\nBest,",
        signature: "Maria Chen",
      },
      taskChecklist: ["Xác nhận điều kiện trả hàng dựa trên thông tin có sẵn.", "Hướng dẫn các bước đóng gói hoặc nhãn gửi trả.", "Nêu khi nào hoàn tiền được xử lý sau khi nhận hàng.", "Không yêu cầu thông tin nhạy cảm qua email."],
      hints: [
        { level: 1, title: "Trình tự rõ ràng", body: "Viết theo thứ tự: đủ điều kiện → nhãn trả hàng → gửi hàng → hoàn tiền." },
        { level: 2, title: "Cụm hữu ích", body: "Your unopened headset is eligible for return. / We will email a prepaid label. / Refunds are processed within..." },
      ],
      sampleAnswer: originalSample("Dear Ms. Chen,\n\nBecause the headset is unopened and was purchased last week, it is eligible for return. We will email you a prepaid shipping label within one business day. Please place the item in its original box, attach the label, and give the parcel to the carrier. After the headset reaches our returns center, the refund will be processed to the original payment method within five business days.\n\nKind regards,\nReturns Team", "Kính gửi bà Chen,\n\nVì tai nghe chưa mở hộp và được mua vào tuần trước, sản phẩm đủ điều kiện trả lại...", "Hướng dẫn theo trình tự và nói rõ hoàn tiền được tính từ khi trung tâm nhận được hàng."),
      planTemplate: ["Confirm eligibility.", "Give the label and packing steps.", "Explain what happens after shipment.", "State refund timing."],
      topicKeywords: ["headset", "unopened", "return", "shipping label", "refund"],
      requiredIdeas: ["eligibility", "return steps", "refund timing"],
    },
    {
      id: "p2-expanded-08",
      orderIndex: 220,
      title: "Website login support",
      titleVi: "Hỗ trợ đăng nhập website",
      summary: "Phản hồi thành viên không thể đăng nhập sau khi đặt lại mật khẩu.",
      promptText: "Write an email response. Provide safe troubleshooting steps, avoid asking for sensitive credentials, and explain the escalation option.",
      tags: ["email", "technical support", "account"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Priya Shah",
        toName: "Member Support",
        subject: "Cannot sign in after password reset",
        body: "Hello,\n\nI reset my password this morning, but the website still says that my email address or password is incorrect. I have tried twice from my laptop. Could you help me access my account before tomorrow's training?\n\nThank you,",
        signature: "Priya Shah",
      },
      taskChecklist: ["Xác nhận sự cố đăng nhập và thời hạn của người dùng.", "Đưa các bước an toàn như kiểm tra email và trình duyệt.", "Không yêu cầu gửi mật khẩu qua email.", "Nêu cách liên hệ hoặc chuyển cấp nếu lỗi tiếp diễn."],
      hints: [
        { level: 1, title: "An toàn tài khoản", body: "Luôn nhắc người dùng không gửi mật khẩu và chỉ dùng liên kết đặt lại chính thức." },
        { level: 2, title: "Cụm hữu ích", body: "Please do not send your password by email. / Try opening the reset link in a private browser window." },
      ],
      sampleAnswer: originalSample("Dear Priya,\n\nWe are sorry that you are still unable to sign in after resetting your password. Please do not send your password by email. First, confirm that you are using the same email address that received the reset link, then try the link in a private browser window. If the message continues, reply with a screenshot of the error only, and we will review the account before tomorrow's training.\n\nBest regards,\nMember Support", "Kính gửi Priya,\n\nChúng tôi rất tiếc vì bạn vẫn chưa thể đăng nhập sau khi đặt lại mật khẩu...", "Đề xuất bước khắc phục nhưng bảo vệ thông tin đăng nhập của người dùng."),
      planTemplate: ["Acknowledge the login issue.", "State the password-safety boundary.", "Give two safe troubleshooting steps.", "Offer an escalation path and timing."],
      topicKeywords: ["sign in", "password reset", "email address", "browser", "training"],
      requiredIdeas: ["safe troubleshooting", "no password request", "escalation"],
    },
    {
      id: "p2-expanded-09",
      orderIndex: 230,
      title: "Catering confirmation",
      titleVi: "Xác nhận suất ăn cho cuộc họp",
      summary: "Trả lời yêu cầu xác nhận bữa trưa cho cuộc họp quý.",
      promptText: "Write an email response. Confirm the requested meal details, ask for any essential dietary information, and state the deadline for changes.",
      tags: ["email", "events", "catering"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Jordan Wells",
        toName: "Catering Coordinator",
        subject: "Lunch count for quarterly meeting",
        body: "Hi,\n\nWe are planning lunch for the quarterly meeting on Friday. The current count is 26 people, and we would like sandwiches, fruit, and coffee. Please let us know if you need any other details.\n\nThanks,",
        signature: "Jordan",
      },
      taskChecklist: ["Xác nhận ngày, số lượng người và lựa chọn bữa ăn.", "Hỏi thông tin dị ứng hoặc chế độ ăn còn thiếu.", "Nêu hạn chót để thay đổi số lượng.", "Giữ nội dung có tổ chức, dễ kiểm tra."],
      hints: [
        { level: 1, title: "Nhắc lại số liệu", body: "Nêu 26 người, ngày thứ Sáu và các món chính để tránh nhầm lẫn." },
        { level: 2, title: "Cụm hữu ích", body: "We have noted the count of 26. / Please send dietary requests by... / Changes after that time may be limited." },
      ],
      sampleAnswer: originalSample("Dear Jordan,\n\nWe have noted lunch for 26 people on Friday, including sandwiches, fruit, and coffee. Please send any vegetarian, allergy, or other dietary requests by noon on Wednesday so that we can finalize the order. You may also update the attendee count until that time. After Wednesday noon, we will do our best to accommodate changes, but the menu and quantity may be limited.\n\nKind regards,\nCatering Coordinator", "Kính gửi Jordan,\n\nChúng tôi đã ghi nhận bữa trưa cho 26 người vào thứ Sáu...", "Lặp lại dữ liệu quan trọng và thiết lập hạn chót hợp lý cho thông tin ăn kiêng."),
      planTemplate: ["Confirm date, count, and menu.", "Ask for dietary needs.", "Give a change deadline.", "Close with a practical note."],
      topicKeywords: ["lunch", "26", "Friday", "sandwiches", "dietary"],
      requiredIdeas: ["confirm details", "dietary information", "deadline"],
    },
    {
      id: "p2-expanded-10",
      orderIndex: 240,
      title: "Maintenance noise concern",
      titleVi: "Phản ánh tiếng ồn bảo trì",
      summary: "Phản hồi người thuê văn phòng về tiếng ồn sửa chữa gần khu làm việc.",
      promptText: "Write an email response. Acknowledge the disruption, describe a realistic mitigation step, and provide a contact or update plan.",
      tags: ["email", "property management", "maintenance"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Evan Miller",
        toName: "Property Management",
        subject: "Noise from repairs near our office",
        body: "Hello,\n\nThe repairs outside Suite 402 have been very noisy since Monday morning. Our team is hosting client calls this week, and the drilling makes it difficult to hear. Can the work be scheduled differently?\n\nRegards,",
        signature: "Evan Miller",
      },
      taskChecklist: ["Thừa nhận sự gián đoạn và tác động đến các cuộc gọi.", "Không hứa dừng công việc nếu chưa xác nhận được lịch.", "Nêu một biện pháp giảm thiểu hoặc bước kiểm tra lịch.", "Cho người gửi biết khi nào sẽ nhận cập nhật."],
      hints: [
        { level: 1, title: "Đồng cảm nhưng chính xác", body: "Công nhận khó khăn của người gửi, sau đó nói bạn sẽ phối hợp với đội sửa chữa." },
        { level: 2, title: "Cụm hữu ích", body: "We understand the disruption. / We are reviewing the work schedule with the contractor. / We will update you by..." },
      ],
      sampleAnswer: originalSample("Dear Mr. Miller,\n\nWe understand that the repair noise is disrupting your client calls, and we are sorry for the inconvenience. We are reviewing the drilling schedule with the contractor to identify quieter periods for this week's work. We cannot confirm a schedule change yet, but we will update you by tomorrow morning. In the meantime, we can reserve a quiet meeting room on another floor for your scheduled calls if space is available.\n\nSincerely,\nProperty Management", "Kính gửi ông Miller,\n\nChúng tôi hiểu tiếng ồn sửa chữa đang ảnh hưởng đến các cuộc gọi với khách hàng...", "Không cam kết điều chưa chắc chắn; nêu hành động và giải pháp tạm thời."),
      planTemplate: ["Acknowledge the disruption.", "State the review action carefully.", "Offer a feasible temporary option.", "Give an update time."],
      topicKeywords: ["repairs", "noise", "drilling", "contractor", "client calls"],
      requiredIdeas: ["acknowledge disruption", "mitigation", "update plan"],
    },
    {
      id: "p2-expanded-11",
      orderIndex: 250,
      title: "Supplier quote follow-up",
      titleVi: "Theo dõi báo giá nhà cung cấp",
      summary: "Phản hồi nhà cung cấp hỏi tiến độ báo giá nội thất văn phòng.",
      promptText: "Write an email response. Thank the supplier, state the quote-review status, and request any specific clarification needed for a decision.",
      tags: ["email", "procurement", "suppliers"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Liam Foster",
        toName: "Procurement Team",
        subject: "Follow-up on office furniture quote",
        body: "Hello,\n\nI sent a quote for the conference tables and chairs last week. Please let me know whether your team needs any additional information or expects to make a decision soon.\n\nBest regards,",
        signature: "Liam Foster",
      },
      taskChecklist: ["Cảm ơn nhà cung cấp đã gửi báo giá.", "Nêu trạng thái xem xét mà không tiết lộ thông tin không cần thiết.", "Hỏi rõ một điểm về báo giá nếu có.", "Cho biết mốc thời gian hợp lý cho bước tiếp theo."],
      hints: [
        { level: 1, title: "Giữ trung lập", body: "Bạn có thể nói quote is under review mà không hứa sẽ mua hàng." },
        { level: 2, title: "Cụm hữu ích", body: "The quote is under review. / Could you confirm the delivery lead time? / We expect to update suppliers by..." },
      ],
      sampleAnswer: originalSample("Dear Mr. Foster,\n\nThank you for following up on the quote for the conference tables and chairs. Our team is currently comparing the proposals and expects to update suppliers by next Friday. Before we complete the review, could you confirm the delivery lead time for the full order and whether installation is included in the quoted price? This information will help us evaluate the total schedule.\n\nBest regards,\nProcurement Team", "Kính gửi ông Foster,\n\nCảm ơn ông đã theo dõi báo giá bàn và ghế phòng họp...", "Trả lời tiến độ, đặt câu hỏi có mục đích và tránh hứa hẹn quyết định mua hàng."),
      planTemplate: ["Thank the supplier.", "State the review status.", "Ask a focused clarification question.", "Give the expected update timing."],
      topicKeywords: ["quote", "conference tables", "chairs", "delivery", "installation"],
      requiredIdeas: ["thank supplier", "review status", "clarification", "timeline"],
    },
    {
      id: "p2-expanded-12",
      orderIndex: 260,
      title: "Volunteer shift confirmation",
      titleVi: "Xác nhận ca tình nguyện",
      summary: "Phản hồi tình nguyện viên muốn xác nhận ca làm việc vào thứ Bảy.",
      promptText: "Write an email response. Confirm the shift details, explain where to arrive, and mention one useful preparation item.",
      tags: ["email", "community", "volunteers"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Nina Rahman",
        toName: "Community Team",
        subject: "Confirming my Saturday volunteer shift",
        body: "Hello,\n\nI signed up to help at the neighborhood book drive this Saturday, but I want to confirm the start time and location. Please let me know if I should bring anything.\n\nThank you,",
        signature: "Nina Rahman",
      },
      taskChecklist: ["Xác nhận ngày, giờ và địa điểm của ca.", "Nêu nơi người tình nguyện cần đăng ký khi đến.", "Đề cập một vật dụng hoặc trang phục hữu ích.", "Kết thúc bằng lời cảm ơn tích cực."],
      hints: [
        { level: 1, title: "Trả lời mọi câu hỏi", body: "Người gửi hỏi giờ, nơi chốn và cần mang gì, nên kiểm tra đủ ba ý." },
        { level: 2, title: "Cụm hữu ích", body: "Please arrive at... / Check in at... / Comfortable shoes are recommended." },
      ],
      sampleAnswer: originalSample("Dear Nina,\n\nThank you for volunteering at the neighborhood book drive this Saturday. Your shift begins at 8:30 a.m. at the East Community Center, and please check in at the welcome table near the main entrance. We recommend wearing comfortable shoes because volunteers will move boxes and arrange books. A team member will provide name tags and instructions when you arrive.\n\nWarm regards,\nCommunity Team", "Kính gửi Nina,\n\nCảm ơn bạn đã đăng ký tình nguyện cho chương trình quyên góp sách khu phố vào thứ Bảy...", "Câu trả lời tốt xác nhận mọi chi tiết và tạo cảm giác chào đón cho tình nguyện viên."),
      planTemplate: ["Thank the volunteer.", "Confirm time and location.", "Describe check-in.", "Mention a useful preparation item."],
      topicKeywords: ["Saturday", "volunteer", "book drive", "community center", "check in"],
      requiredIdeas: ["shift details", "arrival location", "preparation"],
    },
    {
      id: "p2-expanded-13",
      orderIndex: 270,
      title: "Billing address update",
      titleVi: "Cập nhật địa chỉ thanh toán",
      summary: "Hướng dẫn khách cập nhật địa chỉ thanh toán theo cách bảo mật.",
      promptText: "Write an email response. Explain the secure update method, avoid requesting unnecessary personal data by email, and state how confirmation will be sent.",
      tags: ["email", "billing", "account security"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Carmen Diaz",
        toName: "Account Support",
        subject: "Update billing address for our account",
        body: "Hello,\n\nOur company moved offices this month, and I need to update the billing address on our account before the next invoice is issued. Can you tell me the safest way to make this change?\n\nRegards,",
        signature: "Carmen Diaz",
      },
      taskChecklist: ["Xác nhận mục đích cập nhật địa chỉ.", "Chỉ người gửi đến cổng thông tin hoặc quy trình bảo mật.", "Không yêu cầu gửi thông tin thẻ hay dữ liệu nhạy cảm qua email.", "Nêu cách nhận xác nhận sau khi hoàn tất."],
      hints: [
        { level: 1, title: "Bảo vệ dữ liệu", body: "Giải thích rõ phương thức đăng nhập an toàn thay vì yêu cầu địa chỉ hoặc dữ liệu thanh toán đầy đủ qua email." },
        { level: 2, title: "Cụm hữu ích", body: "Please sign in to the secure Account page. / Do not send payment details by email. / A confirmation will be sent after the change." },
      ],
      sampleAnswer: originalSample("Dear Ms. Diaz,\n\nYou can update the billing address through the secure Account page before the next invoice is issued. Please sign in, select Billing Details, and choose Edit Address. For your protection, do not send payment details or account credentials by email. After you save the change, the account owner will receive an automatic confirmation message. If you cannot access the page, we can arrange a secure verification call.\n\nKind regards,\nAccount Support", "Kính gửi bà Diaz,\n\nBà có thể cập nhật địa chỉ thanh toán qua trang Tài khoản bảo mật trước khi hóa đơn tiếp theo được phát hành...", "Ưu tiên quy trình bảo mật và chỉ đưa phương án thay thế phù hợp nếu người dùng không truy cập được."),
      planTemplate: ["Acknowledge the address update.", "Give secure portal steps.", "State the email-security boundary.", "Explain confirmation or support."],
      topicKeywords: ["billing address", "account", "secure", "invoice", "confirmation"],
      requiredIdeas: ["secure method", "no sensitive email data", "confirmation"],
    },
    {
      id: "p2-expanded-14",
      orderIndex: 280,
      title: "Software trial extension",
      titleVi: "Gia hạn dùng thử phần mềm",
      summary: "Phản hồi nhóm khách hàng xin gia hạn thời gian dùng thử phần mềm.",
      promptText: "Write an email response. Acknowledge the trial-extension request, state the review or eligibility step, and explain what the user should expect next.",
      tags: ["email", "software", "subscriptions"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Ken Wallace",
        toName: "Software Support",
        subject: "Request for one-week trial extension",
        body: "Hello,\n\nOur team has been testing your reporting software, but two colleagues were out of the office this week. Could we extend our trial by one week so that they can evaluate the shared features?\n\nThank you,",
        signature: "Ken Wallace",
      },
      taskChecklist: ["Xác nhận đã nhận yêu cầu gia hạn.", "Nêu rằng cần kiểm tra điều kiện hoặc tài khoản trước khi duyệt.", "Cho biết khi nào người gửi sẽ nhận kết quả.", "Nêu cách truy cập sau khi gia hạn nếu được chấp thuận."],
      hints: [
        { level: 1, title: "Không hứa thay cho hệ thống", body: "Bạn có thể nói sẽ kiểm tra eligibility thay vì khẳng định gia hạn ngay." },
        { level: 2, title: "Cụm hữu ích", body: "We will review the trial eligibility. / We will confirm the decision by... / The new end date will appear in..." },
      ],
      sampleAnswer: originalSample("Dear Ken,\n\nThank you for explaining why your team needs additional time to evaluate the shared features. We will review the trial status for your account and confirm whether a one-week extension can be approved by the end of the next business day. If the extension is approved, the new trial end date will appear on the Subscription page, and we will notify the account owner by email.\n\nBest regards,\nSoftware Support", "Kính gửi Ken,\n\nCảm ơn bạn đã giải thích lý do nhóm cần thêm thời gian để đánh giá các tính năng dùng chung...", "Nêu bước kiểm tra điều kiện, mốc phản hồi và cách xác nhận nếu được duyệt."),
      planTemplate: ["Acknowledge the request.", "State the eligibility review.", "Give a decision timeline.", "Explain the approved-extension outcome."],
      topicKeywords: ["trial", "extension", "account", "shared features", "subscription"],
      requiredIdeas: ["acknowledge request", "eligibility review", "timeline", "next step"],
    },
    {
      id: "p2-expanded-15",
      orderIndex: 290,
      title: "Damaged office chair",
      titleVi: "Ghế văn phòng bị hỏng",
      summary: "Phản hồi báo cáo một chiếc ghế mới giao bị hư hại.",
      promptText: "Write an email response. Apologize for the damaged item, request only the evidence needed, and explain the replacement or pickup process.",
      tags: ["email", "facilities", "delivery"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Taylor Morgan",
        toName: "Facilities",
        subject: "New office chair arrived damaged",
        body: "Hi,\n\nThe office chair delivered to my desk this morning has a cracked armrest. The box is still here, and I have not used the chair. Could you arrange a replacement?\n\nThanks,",
        signature: "Taylor",
      },
      taskChecklist: ["Xin lỗi về ghế bị hỏng.", "Hỏi ảnh hoặc mã giao hàng nếu cần xác nhận.", "Nêu cách giao ghế thay thế và thu hồi ghế cũ.", "Không yêu cầu người gửi tự xử lý vật nặng nếu không cần thiết."],
      hints: [
        { level: 1, title: "Làm rõ bằng chứng", body: "Yêu cầu một ảnh vết nứt và mã giao hàng là đủ; đừng yêu cầu nhiều thông tin không cần thiết." },
        { level: 2, title: "Cụm hữu ích", body: "Please send one photo of the damaged armrest. / We will arrange a replacement and collection." },
      ],
      sampleAnswer: originalSample("Dear Taylor,\n\nWe are sorry that the new office chair arrived with a cracked armrest. Please send one photo of the damage and the delivery reference from the box so that we can open a replacement request. Once confirmed, we will schedule delivery of a new chair and arrange collection of the damaged chair from your desk area. You do not need to move it yourself.\n\nRegards,\nFacilities", "Kính gửi Taylor,\n\nChúng tôi xin lỗi vì ghế văn phòng mới đã đến với tay vịn bị nứt...", "Đáp án yêu cầu bằng chứng tối thiểu và giải thích rõ việc thay thế cũng như thu hồi."),
      planTemplate: ["Apologize for the damage.", "Request the essential evidence.", "Explain replacement and collection.", "Reassure the employee about the next step."],
      topicKeywords: ["chair", "damaged", "armrest", "replacement", "delivery"],
      requiredIdeas: ["apology", "evidence", "replacement", "collection"],
    },
    {
      id: "p2-expanded-16",
      orderIndex: 300,
      title: "Library room cancellation",
      titleVi: "Hủy phòng học tại thư viện",
      summary: "Xác nhận hủy một phòng học đã đặt trước tại thư viện.",
      promptText: "Write an email response. Confirm the cancellation, state that the room will be released, and explain how the user can make a new booking later.",
      tags: ["email", "library", "booking"],
      difficulty: "BEGINNER",
      email: {
        fromName: "Ayesha Khan",
        toName: "Library Services",
        subject: "Cancel study room booking for Wednesday",
        body: "Hello,\n\nOur group no longer needs Study Room 3 this Wednesday from 1:00 to 3:00 p.m. Please cancel the booking so another group can use the room.\n\nThank you,",
        signature: "Ayesha Khan",
      },
      taskChecklist: ["Xác nhận đúng phòng, ngày và thời gian hủy.", "Nêu rằng phòng sẽ được mở lại cho người khác.", "Chỉ cách đặt lại nếu nhóm cần lịch khác.", "Giữ email ngắn gọn, lịch sự."],
      hints: [
        { level: 1, title: "Nhắc đúng chi tiết", body: "Lặp lại Study Room 3, Wednesday và khung 1:00–3:00 p.m. để tránh hủy nhầm." },
        { level: 2, title: "Cụm hữu ích", body: "Your booking has been cancelled. / The room is now available. / You may make a new booking through..." },
      ],
      sampleAnswer: originalSample("Dear Ayesha,\n\nYour booking for Study Room 3 on Wednesday from 1:00 to 3:00 p.m. has been cancelled. The room is now available for other library users. If your group needs another time, you may make a new reservation through the library booking page or ask the service desk for assistance. Thank you for letting us know in advance.\n\nBest regards,\nLibrary Services", "Kính gửi Ayesha,\n\nĐặt phòng Study Room 3 của bạn vào thứ Tư từ 1 giờ đến 3 giờ chiều đã được hủy...", "Nêu chính xác chi tiết hủy và đưa một lựa chọn đơn giản để đặt lại."),
      planTemplate: ["Confirm the room and time.", "State that the room is released.", "Explain rebooking.", "Thank the sender."],
      topicKeywords: ["Study Room 3", "Wednesday", "cancelled", "booking", "library"],
      requiredIdeas: ["confirm cancellation", "release room", "rebooking"],
    },
    {
      id: "p2-expanded-17",
      orderIndex: 310,
      title: "Shipment pickup request",
      titleVi: "Yêu cầu lấy hàng gửi đi",
      summary: "Phản hồi yêu cầu sắp xếp lấy các mẫu hàng gửi đi.",
      promptText: "Write an email response. Confirm the pickup request, ask for any shipping details still needed, and explain the collection window.",
      tags: ["email", "logistics", "shipping"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Ruben Silva",
        toName: "Logistics Desk",
        subject: "Request pickup for outgoing samples",
        body: "Hello,\n\nWe have three boxes of product samples ready to send to a client. Could you arrange a carrier pickup tomorrow afternoon? The boxes will be ready at the loading entrance.\n\nRegards,",
        signature: "Ruben Silva",
      },
      taskChecklist: ["Xác nhận yêu cầu lấy hàng và số lượng thùng.", "Hỏi địa chỉ giao, kích thước hoặc người liên hệ nếu cần.", "Nêu khung giờ lấy hàng dự kiến.", "Giải thích cách nhận nhãn hoặc giấy tờ gửi hàng."],
      hints: [
        { level: 1, title: "Kiểm tra thông tin vận chuyển", body: "Muốn đặt xe lấy hàng thường cần điểm đến, kích thước và người liên hệ; chỉ hỏi phần còn thiếu." },
        { level: 2, title: "Cụm hữu ích", body: "Please confirm the delivery address and box dimensions. / The carrier is scheduled between..." },
      ],
      sampleAnswer: originalSample("Dear Ruben,\n\nWe can arrange a carrier pickup for the three sample boxes tomorrow afternoon. Please confirm the delivery address, the approximate box dimensions, and a contact person at the loading entrance. Once we receive those details, we will book a collection window between 1:00 and 4:00 p.m. and send the shipping labels for the boxes.\n\nKind regards,\nLogistics Desk", "Kính gửi Ruben,\n\nChúng tôi có thể sắp xếp hãng vận chuyển đến lấy ba thùng mẫu vào chiều mai...", "Chỉ hỏi thông tin thiếu và trình bày thứ tự từ xác nhận đến đặt xe và gửi nhãn."),
      planTemplate: ["Confirm the pickup request.", "Ask for missing shipping details.", "State the collection window.", "Explain labels or documentation."],
      topicKeywords: ["pickup", "three boxes", "samples", "carrier", "shipping labels"],
      requiredIdeas: ["confirm pickup", "missing details", "collection window", "labels"],
    },
    {
      id: "p2-expanded-18",
      orderIndex: 320,
      title: "Event accessibility question",
      titleVi: "Hỏi về hỗ trợ tiếp cận sự kiện",
      summary: "Phản hồi khách tham dự hỏi về phương án hỗ trợ tiếp cận tại hội thảo.",
      promptText: "Write an email response. State the accessibility support available, invite the attendee to share any specific need, and explain the arrival assistance process.",
      tags: ["email", "events", "accessibility"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Grace Patel",
        toName: "Event Support",
        subject: "Accessibility question for next week's seminar",
        body: "Hello,\n\nI plan to attend next week's seminar and use a wheelchair. Could you let me know whether the building entrance, seating area, and restrooms are accessible? I would also like to know whom to contact when I arrive.\n\nThank you,",
        signature: "Grace Patel",
      },
      taskChecklist: ["Trả lời các điểm hỗ trợ được hỏi: lối vào, chỗ ngồi, nhà vệ sinh.", "Mời người tham dự nêu thêm nhu cầu cụ thể nếu muốn.", "Nêu đầu mối hoặc quy trình hỗ trợ khi đến.", "Không đưa ra giả định về nhu cầu cá nhân."],
      hints: [
        { level: 1, title: "Tôn trọng và cụ thể", body: "Trả lời thông tin cơ sở vật chất trước, sau đó mời người tham dự cho biết bất kỳ hỗ trợ bổ sung nào." },
        { level: 2, title: "Cụm hữu ích", body: "The main entrance has step-free access. / Accessible seating can be reserved. / Please contact... on arrival." },
      ],
      sampleAnswer: originalSample("Dear Ms. Patel,\n\nThank you for contacting us about next week's seminar. The main entrance has step-free access, accessible seating can be reserved in the seminar room, and accessible restrooms are available on the same floor. When you arrive, please contact the event desk at the main entrance, and a team member will assist you with seating. If there is any additional accommodation that would make your visit more comfortable, please let us know in advance.\n\nBest regards,\nEvent Support", "Kính gửi bà Patel,\n\nCảm ơn bà đã liên hệ về hội thảo tuần tới...", "Đáp án bao quát từng câu hỏi, nêu đầu mối đến nơi và mời chia sẻ thêm nhu cầu mà không áp đặt."),
      planTemplate: ["Thank the attendee.", "Address each accessibility question.", "Describe arrival assistance.", "Invite any further request."],
      topicKeywords: ["accessibility", "wheelchair", "entrance", "seating", "restrooms"],
      requiredIdeas: ["available support", "arrival contact", "invite specific needs"],
    },
    {
      id: "p2-expanded-19",
      orderIndex: 330,
      title: "Lost access badge",
      titleVi: "Mất thẻ ra vào",
      summary: "Phản hồi nhân viên làm mất thẻ ra vào tòa nhà theo quy trình an toàn.",
      promptText: "Write an email response. Acknowledge the lost badge, explain the immediate security action, and give the safe steps for obtaining a replacement.",
      tags: ["email", "security", "workplace"],
      difficulty: "ADVANCED",
      email: {
        fromName: "Noah Bennett",
        toName: "Security Desk",
        subject: "Lost access badge",
        body: "Hello,\n\nI cannot find my building access badge after leaving the office last night. I checked my desk and bag this morning. What should I do before I return for my shift tomorrow?\n\nThanks,",
        signature: "Noah Bennett",
      },
      taskChecklist: ["Xác nhận báo mất thẻ.", "Nêu việc vô hiệu hóa thẻ cũ để bảo mật.", "Chỉ cách nhận thẻ tạm hoặc thẻ mới có xác minh danh tính.", "Không yêu cầu chia sẻ thông tin bảo mật qua email."],
      hints: [
        { level: 1, title: "Ưu tiên an toàn", body: "Nói rõ thẻ cũ sẽ được vô hiệu hóa và nhân viên cần xác minh danh tính tại quầy." },
        { level: 2, title: "Cụm hữu ích", body: "We will deactivate the badge immediately. / Please bring photo identification. / A temporary pass can be issued..." },
      ],
      sampleAnswer: originalSample("Dear Noah,\n\nThank you for reporting the lost access badge. We will deactivate the badge immediately to protect the building. Before your shift tomorrow, please visit the security desk with photo identification so that we can issue a temporary pass and begin the replacement process. Do not send identification numbers or security codes by email. If you find the badge later, please return it to the desk.\n\nRegards,\nSecurity Desk", "Kính gửi Noah,\n\nCảm ơn bạn đã báo mất thẻ ra vào...", "Email an toàn luôn nêu hành động vô hiệu hóa, xác minh trực tiếp và giới hạn thông tin gửi qua email."),
      planTemplate: ["Acknowledge the lost badge.", "State the security action.", "Give identity-verification and temporary-pass steps.", "State the email-security boundary."],
      topicKeywords: ["access badge", "deactivate", "security desk", "temporary pass", "identification"],
      requiredIdeas: ["security action", "replacement steps", "identity verification"],
    },
    {
      id: "p2-expanded-20",
      orderIndex: 340,
      title: "Meeting minutes request",
      titleVi: "Yêu cầu biên bản cuộc họp",
      summary: "Phản hồi yêu cầu nhận biên bản của cuộc họp dự án gần đây.",
      promptText: "Write an email response. Confirm the request for meeting minutes, state where or when the document will be shared, and mention any review step before distribution.",
      tags: ["email", "projects", "meetings"],
      difficulty: "INTERMEDIATE",
      email: {
        fromName: "Chen Wu",
        toName: "Project Office",
        subject: "Request for minutes from Monday meeting",
        body: "Hello,\n\nI was unable to attend the project meeting on Monday because of a client visit. Could you send me the meeting minutes and any action items that were assigned to my team?\n\nBest regards,",
        signature: "Chen Wu",
      },
      taskChecklist: ["Xác nhận yêu cầu biên bản và các đầu việc.", "Nêu nơi chia sẻ hoặc thời điểm gửi tài liệu.", "Giải thích nếu biên bản đang chờ người chủ trì kiểm tra.", "Đưa ra bước liên hệ nếu người gửi cần làm rõ đầu việc."],
      hints: [
        { level: 1, title: "Tách hai nhu cầu", body: "Người gửi cần cả biên bản và đầu việc của nhóm; hãy nhắc hai phần này trong email." },
        { level: 2, title: "Cụm hữu ích", body: "The minutes are being reviewed by the meeting chair. / We will share the approved document in... / Your team's action items are..." },
      ],
      sampleAnswer: originalSample("Dear Chen,\n\nWe have received your request for the minutes from Monday's project meeting and the action items assigned to your team. The draft minutes are being reviewed by the meeting chair and will be shared in the project workspace by tomorrow afternoon. Once approved, we will send you a link and highlight the items assigned to your team. Please reply if any deadline or owner needs clarification after you review the document.\n\nBest regards,\nProject Office", "Kính gửi Chen,\n\nChúng tôi đã nhận yêu cầu về biên bản cuộc họp dự án vào thứ Hai và các đầu việc của nhóm bạn...", "Nêu trạng thái duyệt tài liệu, nơi chia sẻ và cách hỗ trợ sau khi người gửi đọc biên bản."),
      planTemplate: ["Confirm the minutes and action-item request.", "State the review status.", "Give a document location or time.", "Explain follow-up for clarification."],
      topicKeywords: ["meeting minutes", "Monday", "action items", "project workspace", "review"],
      requiredIdeas: ["confirm request", "document timing or location", "review step", "follow-up"],
    },
  ];

  return variants.map(createPartTwoSeed);
}

function createPartTwoSeed(variant: PartTwoSeedVariant): WritingPromptRecord {
  return createSeed({
    id: variant.id,
    orderIndex: variant.orderIndex,
    part: 2,
    title: variant.title,
    titleVi: variant.titleVi,
    summary: variant.summary,
    promptText: variant.promptText,
    tags: variant.tags,
    difficulty: variant.difficulty,
    email: variant.email,
    taskChecklist: variant.taskChecklist,
    hints: variant.hints,
    sampleAnswers: [variant.sampleAnswer],
    planTemplate: variant.planTemplate,
    gradingTargets: {
      topicKeywords: variant.topicKeywords,
      requiredIdeas: variant.requiredIdeas,
    },
  });
}

function createSeed(input: Omit<WritingPromptRecord, "version" | "status" | "instructions" | "timeLimitMinutes" | "responseRules" | "rubric" | "sourceLabel" | "createdAtMillis" | "updatedAtMillis" | "email" | "imageUrl" | "imageAlt" | "requiredTerms" | "part1Category"> & Partial<Pick<WritingPromptRecord, "instructions" | "timeLimitMinutes" | "responseRules" | "email" | "imageUrl" | "imageAlt" | "requiredTerms" | "part1Category">>): WritingPromptRecord {
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
    part1Category: part === 1 ? input.part1Category ?? null : null,
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
  const part1Category = validatePart1Category(
    input.part1Category === undefined ? base.part1Category : input.part1Category,
    part,
  );
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
    part1Category,
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
    part1Category: null,
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
    if (snapshot.exists) {
      const stored = toPromptRecord(cleanPromptId, recordValue(snapshot.data()));
      return stored ? hydrateLegacyPart1Category(stored, seeded) : seeded;
    }
  } catch {
    // Fall back to the bundled original content only. Non-seed private/admin
    // content cannot be exposed when Firestore is unavailable.
  }
  return seeded;
}

function mergeSeedAndFirestore(seeds: WritingPromptRecord[], firestore: WritingPromptRecord[]): WritingPromptRecord[] {
  const merged = new Map<string, WritingPromptRecord>(seeds.map((item) => [item.id, item]));
  firestore.forEach((item) => {
    const seed = merged.get(item.id);
    merged.set(item.id, hydrateLegacyPart1Category(item, seed));
  });
  return [...merged.values()];
}

/**
 * Seeded Firestore documents created before Part 1 categories existed retain
 * their edited content but inherit the category for their stable seed id.
 * A custom prompt with no matching seed deliberately remains uncategorized.
 */
function hydrateLegacyPart1Category(
  record: WritingPromptRecord,
  seed: WritingPromptRecord | null | undefined,
): WritingPromptRecord {
  if (record.part !== 1 || record.part1Category || seed?.part !== 1) return record;
  return { ...record, part1Category: seed.part1Category };
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
    part1Category: part === 1 ? asPart1Category(data.part1Category) : null,
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
  prompt.imageUrl = toPracticeImageUrl(prompt.imageUrl ?? null);
  return prompt as WritingPrompt;
}

function toWritingPromptCard(record: WritingPromptRecord): WritingPromptCard {
  return {
    id: record.id,
    part: record.part,
    title: record.title,
    titleVi: record.titleVi,
    summary: record.summary,
    tags: record.tags,
    part1Category: record.part1Category,
    difficulty: record.difficulty,
    timeLimitMinutes: record.timeLimitMinutes,
    thumbnailUrl: toCardImageUrl(record.imageUrl),
    imageAlt: record.imageAlt,
    requiredTerms: record.requiredTerms,
  };
}

function toPracticeImageUrl(imageUrl: string | null): string | null {
  return toOptimizedWritingImageUrl(imageUrl, "practice");
}

function toCardImageUrl(imageUrl: string | null): string | null {
  return toOptimizedWritingImageUrl(imageUrl, "card");
}

function toOptimizedWritingImageUrl(
  imageUrl: string | null,
  variant: "card" | "practice",
): string | null {
  if (!imageUrl?.startsWith("/writing/") || !imageUrl.endsWith(".png")) return imageUrl;
  return imageUrl.replace(/\.png$/, `-${variant}-${WRITING_MEDIA_VERSION}.webp`);
}

function invalidateWritingPromptCache() {
  revalidateTag(WRITING_PROMPT_CACHE_TAG, { expire: 0 });
}

const cachedReadMergedPromptRecords = unstable_cache(
  readMergedPromptRecords,
  ["writing-prompt-records"],
  { revalidate: 300, tags: [WRITING_PROMPT_CACHE_TAG] },
);

const cachedFindPromptRecord = unstable_cache(
  async (id: string) => findPromptRecord(id),
  ["writing-prompt-record"],
  { revalidate: 300, tags: [WRITING_PROMPT_CACHE_TAG] },
);

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

function validatePart1Category(value: unknown, part: WritingPart): WritingPartOneGrammarCategory | null {
  if (part !== 1 || value == null) return null;
  const category = asPart1Category(value);
  if (!category) throw BadRequest("Invalid Part 1 grammar category");
  return category;
}

function asPart1Category(value: unknown): WritingPartOneGrammarCategory | null {
  return typeof value === "string" && (WRITING_PART_ONE_GRAMMAR_CATEGORIES as readonly string[]).includes(value)
    ? value as WritingPartOneGrammarCategory
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
