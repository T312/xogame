# 🌸 Cờ Ca Rô

Game Cờ Ca Rô (Gomoku) bàn 15×15, giao diện pastel dễ thương. **Không cần database**: phòng chơi online được giữ trong RAM của máy chủ.

## Tính năng

- 🌐 **Chơi online 2 người**: tạo phòng, gửi mã 4 ký tự hoặc link mời cho bạn bè
- Tự nối lại khi rớt mạng hoặc tải lại trang (giữ nguyên ghế trong phòng)
- 💬 **Chat trong phòng**: nhắn tin với đối thủ (tối đa 200 ký tự, thu gọn được, có số tin chưa đọc). Tin nhắn chỉ lưu tạm trong RAM (50 tin gần nhất), mất khi phòng bị xóa
- Gửi biểu cảm emoji cho đối thủ, chơi lại (đổi bên đi trước), bảng điểm theo phòng
- 🤖 Chơi với máy (3 mức: Dễ / Vừa / Khó), hoặc 2 người chung 1 máy
- Đi lại nước (khi chơi offline), tô sáng đường thắng, âm thanh bật/tắt, dùng tốt trên điện thoại

Luật: ai xếp được 5 quân liên tiếp (ngang, dọc, chéo) trước thì thắng. X đi trước.
Máy chủ kiểm tra mọi nước đi và thắng/thua nên không thể gian lận.

## 📲 Cài thành app trên điện thoại (PWA)

Sau khi deploy lên Render (link `https://....onrender.com`, đã có HTTPS):

- **Android (Chrome):** mở link → bấm nút **📲 Cài app** trong game (hoặc menu ⋮ → *Cài đặt ứng dụng / Thêm vào màn hình chính*).
- **iPhone/iPad (Safari):** mở link → nút **Chia sẻ** ⬆️ → **Thêm vào MH chính**.

App có icon riêng, mở toàn màn hình; chế độ chơi với máy dùng được cả khi mất mạng. Chơi online cần có mạng.

## Chạy thử trên máy

```bash
npm install
npm start
```

Mở http://localhost:3000 (mở 2 tab, chọn "Online với bạn bè" để thử).

## Đưa lên GitHub

```bash
git init
git add .
git commit -m "Caro game online"
git branch -M main
git remote add origin https://github.com/<ten-ban>/<ten-repo>.git
git push -u origin main
```

> Trên GitHub, các file `server.js`, `package.json` và thư mục `public/` phải nằm **ngoài cùng** repo.

## Deploy lên Render (bắt buộc là **Web Service**, không dùng Static Site)

Chơi online cần máy chủ Node chạy liên tục để nối WebSocket, nên Static Site sẽ không chơi online được.

1. Vào https://render.com → **New +** → **Web Service**
2. Chọn repo GitHub của bạn
3. Điền:
   - **Runtime / Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - **Health Check Path:** `/healthz` (tùy chọn)
4. Bấm **Create Web Service**, đợi vài phút là có link dạng `https://ten-ban.onrender.com`.

(Repo có sẵn `render.yaml`, bạn cũng có thể dùng **Blueprint**.)

### Lưu ý với gói Free của Render

- Máy chủ tự ngủ sau ~15 phút không ai truy cập; lần mở đầu tiên sau đó mất khoảng 30–60 giây để thức dậy.
- Khi máy chủ khởi động lại hoặc redeploy, các phòng đang chơi sẽ mất (vì lưu trong RAM). Chỉ cần tạo phòng mới.
- Phòng không ai kết nối quá 10 phút sẽ tự xóa.
