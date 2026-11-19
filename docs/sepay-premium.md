# Thử chuyển khoản SePay để đổi trạng thái Premium

## Phạm vi

- Trang `/account`, mục **Gói tài khoản**, hiển thị **Thường** hoặc **Premium**.
- Mỗi yêu cầu thanh toán có mã riêng bắt đầu bằng `EWP`, số tiền do máy chủ quyết định và QR điền sẵn thông tin.
- Chuyển đúng số tiền, tài khoản, ngân hàng và nội dung của yêu cầu còn hiệu lực sẽ kích hoạt Premium khi SePay gửi webhook hợp lệ.
- Giai đoạn này chưa giới hạn bất kỳ tính năng học nào và chưa áp dụng thời hạn/gia hạn Premium. Đây vẫn là chuyển tiền thật nếu dùng tài khoản ngân hàng thật.

## 1. Cấu hình website

Điền vào `web/.env.local` khi chạy trên máy, hoặc **Vercel → Project → Settings → Environment Variables** khi dùng website đã triển khai:

```dotenv
SEPAY_WEBHOOK_API_KEY=<khoa-ngau-nhien-bi-mat>
SEPAY_BANK_CODE=MBBank
SEPAY_BANK_GATEWAY=MBBank
SEPAY_BANK_ACCOUNT_NUMBER=<so-tai-khoan-da-lien-ket>
SEPAY_BANK_ACCOUNT_NAME=<ten-chu-tai-khoan>
SEPAY_PREMIUM_AMOUNT=2000
```

Khóa webhook là khóa riêng cho tích hợp này, được nhập giống nhau ở hai bên. Không cần API Token để truy vấn tài khoản SePay. Giữ khóa trên máy chủ; không thêm tiền tố `NEXT_PUBLIC_` hay đưa khóa vào Git. Nếu thiếu cấu hình, trang tài khoản sẽ thông báo chưa thể tạo chuyển khoản thử.

Sau khi thay đổi biến môi trường, khởi động lại máy chủ khi chạy trên máy hoặc triển khai lại trên Vercel. Không đổi ngân hàng nhận tiền khi còn mã thanh toán đang chờ: mỗi mã lưu thông tin nhận tiền tại thời điểm tạo.

## 2. Tạo webhook trong SePay

Trong **Tích hợp Webhooks → Thêm webhook**, điền:

| Mục | Giá trị |
| --- | --- |
| Tên | EnglishWebApp Premium |
| Sự kiện | Có tiền vào |
| URL | `https://www.dautoiec.tech/api/payments/sepay/webhook` |
| Tài khoản | Chọn đúng tài khoản MB dùng ở cấu hình website |
| Phương thức | POST |
| Định dạng | JSON |
| Xác thực | API Key |
| API Key | Cùng giá trị `SEPAY_WEBHOOK_API_KEY` trên máy chủ |
| Tự động gửi lại khi máy chủ trả lỗi | Bật |

Nếu dùng tên miền khác, thay phần tên miền của URL và dùng tên miền cuối cùng, không qua chuyển hướng. `englishwebapp.vercel.app` hiện chuyển hướng HTTP 308 sang `www.dautoiec.tech`. SePay cần gọi được URL công khai; `localhost` chỉ dùng được qua đường hầm HTTPS công khai đã cấu hình.

Mã thanh toán của ứng dụng có dạng `EWP` + 20 ký tự chữ/số hệ thập lục phân viết hoa. Nếu dùng bộ lọc mã của SePay, đặt tiền tố `EWP` và bảo đảm mẫu nhận cả chữ lẫn số (ví dụ `EWP[A-F0-9]{20}`). Có thể để tắt **Bỏ qua giao dịch không có mã** và không đặt bộ lọc khi thử lần đầu; website tự tìm mã trong `content` ngay cả khi `code` rỗng. Không cấu hình một mẫu khác làm SePay cắt ngắn mã.

Tài liệu chính thức: [tạo webhook](https://docs.sepay.vn/tich-hop-webhooks.html), [xác thực API Key](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc), [QR chuyển khoản](https://docs.sepay.vn/tao-qr-code-vietqr-dong.html).

## 3. Kiểm tra với giao dịch thật

1. Đăng nhập tài khoản thử trên website, mở **Tài khoản → Gói tài khoản**. Ban đầu hiển thị **Thường**.
2. Bấm **Tạo mã chuyển khoản thử**. Kiểm tra ngân hàng, số tài khoản, chủ tài khoản và số tiền hiển thị.
3. Dùng ứng dụng ngân hàng quét QR và chuyển đúng số tiền, giữ nguyên nội dung `EWP...`. Mã có hiệu lực 30 phút; khi hết hạn hãy tạo mã mới trước khi chuyển.
4. Giữ trang mở. Website kiểm tra khoảng 5 giây một lần khi tab đang hiển thị. Có thể bấm **Kiểm tra trạng thái**; thao tác này chỉ đọc trạng thái máy chủ.
5. Sau khi webhook khớp giao dịch, trạng thái đổi thành **Premium**. Tải lại trang hoặc đăng nhập lại vẫn giữ Premium.

Thời điểm chuyển khoản trong webhook được dùng để kiểm tra hiệu lực mã; thông báo đến trễ vẫn xử lý nếu giao dịch thực sự diễn ra trong thời hạn. Chuyển thiếu/thừa tiền, sai nội dung hoặc chuyển sau hạn sẽ không tự kích hoạt; kiểm tra nhật ký và xử lý khoản chuyển đó riêng.

Mỗi tài khoản chỉ có một mã đang chờ và tối đa 10 mã mới mỗi ngày. Khi đã Premium, hãy dùng tài khoản thử khác để kiểm tra lại. Không có nút phía trình duyệt để tự nâng cấp hoặc hạ gói.

## Dữ liệu và xử lý lỗi

- `userMemberships/{uid}` lưu gói và thời điểm kích hoạt; không thay đổi quyền `STUDENT`/`ADMIN` hay dữ liệu học tập.
- `paymentOrders/{code}` lưu chủ sở hữu, số tiền, thông tin nhận tiền và trạng thái.
- `sepayTransactions/{transactionId}` ngăn cùng giao dịch được xử lý nhiều lần. Thanh toán, ghi giao dịch và đổi Premium nằm trong cùng một giao dịch Firestore.
- Các collection này chỉ được máy chủ truy cập. Quy tắc mặc định trong `firestore.rules` đã chặn truy cập trực tiếp từ trình duyệt; không cần mở thêm quyền.
- Webhook xác thực hợp lệ trả HTTP `201` với `{"success":true}` khi đã xử lý hoặc khi bỏ qua giao dịch không khớp. Lỗi lưu dữ liệu trả `5xx` để SePay có thể gửi lại; sai khóa trả `401`.
- Nếu chưa đổi trạng thái: kiểm tra **Nhật ký webhooks** trong SePay, URL, khóa, `gateway`, `accountNumber`, số tiền, mã và thời điểm giao dịch. Khi lỗi máy chủ đã được sửa, dùng chức năng gửi lại giao dịch trong nhật ký.
- Có thể điều chỉnh `RATE_LIMIT_SEPAY_WEBHOOK_PER_MIN` (mặc định 600) nếu lưu lượng webhook tăng.

Nút **Gửi thử** trong SePay kiểm tra kết nối HTTP, nhưng payload mẫu không gắn với mã đang chờ sẽ không nâng cấp tài khoản. Chỉ coi đã kiểm tra đầy đủ sau khi một giao dịch đúng của tài khoản thử được ghi nhận và trạng thái đổi thành Premium.

Payload thử có `id: 0` được xác thực rồi trả thành công mà không ghi dữ liệu hay đổi gói. Giao dịch ngân hàng thật vẫn phải có ID dương và vượt qua đầy đủ các kiểm tra thanh toán.
