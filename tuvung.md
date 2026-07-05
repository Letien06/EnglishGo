# Plan nghiep vu flow De thi TOEIC

Tai lieu nay mo ta flow cho muc **De thi** khi nguoi dung bam **Thi thu**: cho phep chon lam ca bai, lam theo tung part/nhieu part, dat thoi gian lam bai, lam bai, nop bai va xem ket qua. Ten file giu theo yeu cau `tuvung.md`, nhung noi dung la plan cho module De thi.

## 1. Muc tieu san pham

- Nguoi hoc co the lam **full test 200 cau** nhu thi that.
- Nguoi hoc co the lam **theo Part** de luyen rieng Part 1-7.
- Nguoi hoc co the **tuy chinh thoi gian** theo muc tieu luyen tap.
- He thong phai luu draft rieng theo cau hinh bai thi de khong bi lan dap an giua Full Test va Part Test.
- Khi nop bai, ket qua phai cham dung theo **tap cau hoi da chon**, khong mac dinh cham 200 cau neu nguoi dung chi thi 1 part.
- Trang ket qua phai co tong diem va phan tich theo part de nguoi hoc biet yeu/mani part nao.

## 2. Man danh sach de thi

### Card de thi

Thong tin hien thi tren moi card:

- Ten de: vi du `Test 1`.
- Bo de/nguon: vi du `ETS 2026`.
- So cau mac dinh: `200 cau`.
- Thoi gian mac dinh: `120 phut`.
- Trang thai gan nhat:
  - `Chua luyen tap`
  - `Dang lam do`
  - `Da hoan thanh`
  - Diem gan nhat neu co.

### Nut `Thi thu`

Muc dich:

- Mo modal chon che do thi.
- Khong dieu huong vao session ngay.

Quy tac:

- Neu nguoi dung chua dang nhap: dieu huong `/login?redirect=/practice`.
- Neu de chua co cau hoi: disable nut va hien tooltip/label `De chua co du lieu`.
- Neu co draft cu cung cau hinh gan nhat: modal hien them lua chon `Tiep tuc bai dang lam`.

### Nut `Luyen tap`

Muc dich:

- Mo cung modal chon che do, nhung mac dinh tab `Luyen tap`.
- Tab nay co the cho chon part nhanh, thoi gian linh hoat hon, va khong can cam giac thi that.

Quy tac:

- Van luu attempt nhu binh thuong neu nguoi dung nop bai.
- Co the them sau che do `review ngay sau moi cau`; giai doan dau nen dung chung flow nop bai cuoi cung de don gian va on dinh.

### Nut `Lich su`

Muc dich:

- Di toi `/practice/history`.
- Xem tat ca attempt da nop.

Quy tac:

- Neu card co attempt gan nhat, co the them link phu `Xem ket qua gan nhat`.

## 3. Modal chon che do

Modal xuat hien sau khi bam `Thi thu` hoac `Luyen tap`.

### Header modal

Thanh phan:

- Tieu de: `Chon che do`.
- Ten de: `Test 1`.
- Nut dong `X`.

Nut `X`:

- Dong modal.
- Khong tao draft.
- Khong mat du lieu da luu truoc do.

### Tab `Luyen thi`

Muc dich:

- Mo phong thi that.
- Mac dinh chon Full Test.

Thong so mac dinh:

- Mode: `exam`.
- Parts: `1,2,3,4,5,6,7`.
- Time: `120` phut.
- Cau hoi: `200`.

### Tab `Luyen tap`

Muc dich:

- Luyen linh hoat theo part.
- Mac dinh chon part gan nhat nguoi dung hay hoc hoac Part 5 neu chua co lich su.

Thong so mac dinh:

- Mode: `practice`.
- Parts: theo lua chon nguoi dung.
- Time: goi y theo tong so cau.

## 4. Khoi `Full Test`

### Nut/chon `Full Test (200 cau)`

Hanh vi:

- Chon tat ca Part 1-7.
- Set tong cau = 200.
- Set thoi gian goi y = 120 phut.
- Bo chon cac part rieng le neu dang o trang thai chi chon part.

Trang thai UI:

- Khi dang duoc chon: card co vien xanh/nen xanh nhe.
- Hien badge:
  - `120 phut`
  - `200 cau`

### Nut `Bat dau` trong Full Test

Hanh vi:

- Validate:
  - Test co du lieu.
  - Time hop le.
  - Parts = 1-7.
- Tao/lay draft theo session key:
  - `practice:{testId}:exam:parts=1,2,3,4,5,6,7:time=120`
- Dieu huong:
  - `/practice/session/{testId}?mode=exam&parts=1,2,3,4,5,6,7&time=120`

Quy tac neu co draft cu:

- Neu cung session key da co draft:
  - Hien confirm: `Ban co bai dang lam, tiep tuc hay lam lai?`
  - Nut `Tiep tuc`: giu draft va vao bai.
  - Nut `Lam lai`: xoa draft cu cua session key va tao lai.

## 5. Khoi `Thi theo Part`

### Nut `Chon tat ca 7 Part`

Hanh vi:

- Chon tat ca Part 1-7.
- Cap nhat tong cau = 200.
- Goi y time = 120 phut.
- Ve nghiep vu, day tuong duong Full Test nhung mode van co the la `part` neu nguoi dung bat dau tu khoi part.

Khuyen nghi:

- Neu chon tat ca 7 part, URL nen dung `mode=exam` de ket qua/hien thi nhat quan voi Full Test.

### Nut Part 1

Thong tin:

- Nhom: Listening.
- So cau TOEIC chuan: 6 cau.
- Goi y time: 4 phut.

Hanh vi:

- Toggle chon/bo chon Part 1.
- Neu chon duy nhat Part 1: tong cau = 6, time goi y = 4.
- Neu dang co Full Test selected: bo Full Test selected va chuyen sang Part mode.

### Nut Part 2

Thong tin:

- Nhom: Listening.
- So cau TOEIC chuan: 25 cau.
- Goi y time: 15 phut.

Hanh vi:

- Toggle chon/bo chon Part 2.
- Cap nhat tong cau va time goi y theo tong part da chon.

### Nut Part 3

Thong tin:

- Nhom: Listening.
- So cau TOEIC chuan: 39 cau.
- Goi y time: 25 phut.

Hanh vi:

- Toggle chon/bo chon Part 3.
- Vi Part 3 gom nhom hoi thoai, session phai giu group/passage/audio chung cho cac cau lien quan.

### Nut Part 4

Thong tin:

- Nhom: Listening.
- So cau TOEIC chuan: 30 cau.
- Goi y time: 20 phut.

Hanh vi:

- Toggle chon/bo chon Part 4.
- Session phai giu audio/nhom cau dung thu tu.

### Nut Part 5

Thong tin:

- Nhom: Reading.
- So cau TOEIC chuan: 30 cau.
- Goi y time: 18 phut.

Hanh vi:

- Toggle chon/bo chon Part 5.
- Hien cau hoi doc lap, khong can passage.

### Nut Part 6

Thong tin:

- Nhom: Reading.
- So cau TOEIC chuan: 16 cau.
- Goi y time: 10 phut.

Hanh vi:

- Toggle chon/bo chon Part 6.
- Phai giu passage/cloze group dung thu tu.

### Nut Part 7

Thong tin:

- Nhom: Reading.
- So cau TOEIC chuan: 54 cau.
- Goi y time: 42 phut.

Hanh vi:

- Toggle chon/bo chon Part 7.
- Phai giu single/double/triple passages va cac cau hoi lien quan.

### Nut `Bat dau` trong Thi theo Part

Hanh vi:

- Validate:
  - It nhat 1 part duoc chon.
  - Time hop le.
  - Part nam trong 1-7.
- Neu chon tat ca 7 part:
  - Dieu huong `mode=exam&parts=1,2,3,4,5,6,7&time={time}`.
- Neu chon mot hoac nhieu part:
  - Dieu huong `mode=part&parts={parts}&time={time}`.

Vi du:

- Part 5: `/practice/session/123?mode=part&parts=5&time=18`
- Part 5,6,7: `/practice/session/123?mode=part&parts=5,6,7&time=70`

### Nut `Dat lai`

Hanh vi:

- Xoa lua chon part hien tai.
- Set time ve goi y mac dinh.
- Disable `Bat dau` cho den khi co part duoc chon.

## 6. O nhap thoi gian

Thanh phan:

- Label: `Thoi gian lam bai`.
- Input number hoac stepper.
- Don vi: `phut`.
- Quick buttons:
  - `15 phut`
  - `30 phut`
  - `60 phut`
  - `120 phut`
  - `Goi y`

Quy tac validate:

- Min: 1 phut.
- Max: 180 phut.
- Full Test mac dinh: 120 phut.
- Neu user nhap 0, rong, chu, so am: bao loi `Thoi gian khong hop le`.
- Neu thoi gian qua ngan so voi so cau:
  - Van cho phep, nhung hien warning: `Thoi gian kha ngan cho {questionCount} cau`.
- Neu user bam `Goi y`:
  - Tinh lai theo parts dang chon.

Cong thuc goi y ban dau:

- Part 1: 4 phut.
- Part 2: 15 phut.
- Part 3: 25 phut.
- Part 4: 20 phut.
- Part 5: 18 phut.
- Part 6: 10 phut.
- Part 7: 42 phut.
- Full Test: 120 phut.

## 7. Man lam bai

### Header co dinh

Thanh phan:

- Logo/Back.
- Tieu de section:
  - Full: `TOEIC Full Test: Questions 1 of 200`
  - Part: `Part 5: Questions 1 of 30`
  - Nhieu part: `Parts 5-7: Questions 1 of 100`
- Nut audio global neu bai co listening.
- Counter: `{answered}/{total}`.
- Timer: `HH:MM:SS`.
- Nut `Submit`.

### Nut Back/Logo

Hanh vi:

- Khong thoat ngay.
- Neu co thay doi chua luu: hien confirm `Thoat bai thi? Dap an da luu nhap se duoc giu.`
- Nut `O lai`: dong confirm.
- Nut `Thoat`: ve `/practice`.

### Nut Audio

Hanh vi:

- Chi hien khi session co Part 1-4.
- Bam de phat/tam dung audio cua cau/group hien tai neu co.
- Neu cau hien tai khong co audio: disable.

Quy tac:

- Khong nen autoplay bat buoc vi trinh duyet co the chan.
- Co the them option `Auto play listening` sau.

### Counter `{answered}/{total}`

Hanh vi:

- Cap nhat ngay khi user chon dap an hoac xoa dap an.
- Click vao counter co the mo navigator cau hoi.

### Timer

Hanh vi:

- Dem nguoc theo `time` query.
- Khi con 5 phut: doi mau vang/canh bao nhe.
- Khi con 1 phut: doi mau do.
- Khi het gio:
  - Auto save.
  - Auto submit.
  - Hien status `Het gio, dang nop bai...`.

Quy tac:

- Timer dua tren `startedAtMillis + duration`.
- Reload trang khong reset gio.
- Neu user doi query time khi da co draft: khong duoc gian lan; server dung duration da luu trong draft/session config.

### Nut `Submit`

Hanh vi:

- Mo modal confirm nop bai.
- Khong nop ngay.

Trang thai:

- Enabled trong suot bai thi.
- Khi dang submit: disabled va label `Dang nop...`.

## 8. Khung cau hoi

### Dap an A/B/C/D

Hanh vi:

- Bam vao dong dap an se chon radio.
- Bam lai dap an dang chon:
  - Khuyen nghi: khong bo chon de giong bai thi that.
  - Neu muon bo chon, them nut `Xoa dap an` rieng.

Trang thai:

- Chua chon: vien xam.
- Dang chon: vien xanh, nen xanh nhe.
- Da luu draft: khong can thong bao moi cau, chi can status chung `Da luu`.

### Nut `Xoa dap an`

Hanh vi:

- Xoa dap an cau hien tai.
- Counter giam 1 neu cau da tra loi.
- Draft pending save.

Quy tac:

- Chi hien khi cau da co dap an.

### Nut `Cau truoc`

Hanh vi:

- Chuyen ve cau truoc trong danh sach cau da filter.
- Disabled o cau dau tien.

### Nut `Cau tiep`

Hanh vi:

- Chuyen sang cau tiep theo.
- Disabled o cau cuoi cung hoac doi thanh `Nop bai` o cau cuoi.

### Nut `Danh dau`

Hanh vi:

- Toggle mark cau hoi de xem lai.
- Navigator hien mau/vien rieng cho cau marked.
- Mark luu trong draft payload.

## 9. Navigator cau hoi

Hien thi:

- Grid so cau.
- Nhom theo part:
  - Listening: Part 1-4.
  - Reading: Part 5-7.

Trang thai tung o:

- Chua lam: nen trang/vien xam.
- Da lam: nen xanh.
- Dang xem: vien xanh dam.
- Danh dau: cham vang hoac icon co.

Nut trong navigator:

- Bam so cau: scroll/chuyen den cau do.
- Bam ten Part: scroll den cau dau part do.

## 10. Autosave draft

Draft key phai gom:

- `testId`
- `mode`
- `parts`
- `time`

Vi du:

```text
practice:123:mode=part:parts=5,6,7:time=70
```

Payload draft:

```json
{
  "answers": {
    "101": { "selectedOptionId": 1011, "textResponse": null }
  },
  "markedQuestionIds": [101, 110],
  "config": {
    "mode": "part",
    "parts": [5, 6, 7],
    "durationMinutes": 70,
    "questionCount": 100
  }
}
```

Quy tac:

- Autosave sau 10-15 giay khi co thay doi.
- Bam `Submit` thi save ngay truoc khi nop.
- Reload trang doc lai draft dung session key.
- Neu doi parts/time tao session key khac, khong doc nham draft cu.

## 11. Modal confirm nop bai

Hien khi bam `Submit`.

Noi dung:

- Title: `Xac nhan nop bai?`
- Mo ta:
  - `Sau khi nop bai, ban se khong the thay doi cau tra loi.`
  - `Da lam {answered}/{total} cau.`
  - Neu con cau chua lam: `Con {unanswered} cau chua tra loi.`

### Nut `Quay lai`

Hanh vi:

- Dong modal.
- Quay lai bai thi.
- Khong submit.

### Nut `Nop bai`

Hanh vi:

- Save draft ngay.
- Goi API submit.
- Disable tat ca controls.
- Dieu huong den review khi thanh cong.

Loi:

- Neu API loi: hien toast/status `Nop bai that bai, vui long thu lai`.
- Khong xoa local draft neu submit that bai.

## 12. Submit API

Request can co:

```json
{
  "mode": "part",
  "parts": [5, 6, 7],
  "durationMinutes": 70,
  "answers": [
    { "questionId": 101, "selectedOptionId": 1011, "textResponse": null }
  ]
}
```

Server phai:

- Validate `mode`.
- Validate `parts`.
- Validate `durationMinutes`.
- Load dung cau hoi theo parts.
- Chi cham cac cau trong parts.
- Tinh expired theo duration cua session config.
- Luu attempt gom:
  - mode
  - parts
  - durationMinutes
  - questionCount
  - correctCount
  - scorePercent
  - startedAtMillis
  - submittedAtMillis
  - elapsedMillis
  - partBreakdown

## 13. Trang ket qua

### Khoi tong quan

Hien thi:

- Icon cup.
- `Hoan thanh bai thi!`
- Ten de.
- Diem:
  - `{correctCount} / {questionCount} cau dung`
  - `{accuracy}% chinh xac`
- Mode:
  - `Full Test`
  - `Thi theo Part 5`
  - `Thi theo Parts 5, 6, 7`
- Thoi gian da lam.

### Phan tich theo Part

Chi hien cac part trong attempt.

Moi dong part:

- Icon listening/reading.
- Ten part.
- `{correct}/{total} ({percent}%)`.
- Progress bar.

Neu lam full test:

- Hien Part 1-7.

Neu chi lam Part 5:

- Chi hien Part 5.

### Nut `Xem lai bai thi`

Hanh vi:

- Mo review chi tiet tung cau cua attempt.
- Hien dap an dung, dap an da chon, giai thich neu co.

### Nut `Lam lai`

Hanh vi:

- Tao session moi voi dung config attempt cu:
  - cung testId
  - cung mode
  - cung parts
  - cung durationMinutes
- Xoa draft cu cua config do.
- Dieu huong vao session.

### Nut `Quay lai danh sach`

Hanh vi:

- Dieu huong `/practice`.

## 14. Lich su lam bai

Moi row/card history nen hien:

- Ten de.
- Mode:
  - Full Test
  - Part 5
  - Parts 5,6,7
- Diem.
- So cau dung/tong cau.
- Thoi gian da lam.
- Ngay nop.

Nut:

- `Xem lai`: vao review attempt.
- `Lam lai`: dung config attempt cu.

## 15. Data model de luu attempt

Them truong vao attempt:

```json
{
  "source": "DAUTOEIC",
  "attemptId": 123456789,
  "testId": 123,
  "title": "Test 1",
  "mode": "part",
  "parts": [5, 6, 7],
  "durationMinutes": 70,
  "questionCount": 100,
  "correctCount": 80,
  "score": 80,
  "startedAtMillis": 123,
  "submittedAtMillis": 456,
  "elapsedMillis": 3600000,
  "expired": false,
  "partBreakdown": [
    { "part": 5, "total": 30, "correct": 24 },
    { "part": 6, "total": 16, "correct": 13 },
    { "part": 7, "total": 54, "correct": 43 }
  ]
}
```

## 16. Cac edge case can xu ly

- User chon Part nhung part do khong co cau hoi: disable part va hien `0 cau`.
- User nhap time qua lon: cap o muc 180 phut hoac bao loi.
- User refresh trang: giu answer va timer.
- User mo 2 tab cung session: lan save sau cung thang; can chap nhan giai doan dau.
- User het gio khi offline: khi online lai submit bang elapsed server; neu qua grace thi attempt expired.
- User chi lam Reading: khong hien nut audio global.
- User chi lam Listening: van hien audio va layout hinh/audio hop ly.
- User nop bai khi chua tra loi cau nao: van cho nop sau confirm.
- User bam back browser: can canh bao neu co draft thay doi chua luu.

## 17. Thu tu code de giam rui ro

1. Them parser/validator `mode`, `parts`, `time` trong service practice.
2. Sua `getPracticeSession` de filter questions theo parts va duration theo query.
3. Sua draft key/API de luu theo session config.
4. Sua submit API de nhan config va cham dung tap cau hoi.
5. Sua UI danh sach de thi va modal chon che do.
6. Sua UI session: header, timer, counter, submit confirm, navigator.
7. Sua review/history de hien mode, parts, part breakdown.
8. Them test unit cho validator va grading theo part.
9. Chay `tsc`, `eslint`, `build`, `test`.

## 18. Tieu chi hoan thanh

- Bam `Thi thu` mo modal, khong vao bai ngay.
- Full Test vao du 200 cau, 120 phut mac dinh.
- Chon Part 5 chi vao Part 5, tong 30 cau, submit cham 30 cau.
- Chon Part 5-7 chi vao Reading 5-7, submit cham dung tong cau cua 3 part.
- Timer reload khong reset.
- Draft cua Full Test va Part Test khong lan nhau.
- Submit co confirm.
- Ket qua hien dung tong cau va breakdown theo part da thi.
- Build/test pass va push sau khi duoc duyet code.
