// 11-23 모바일(전시 QR): 폰·태블릿(터치 전용)에서는 정리방(app.html)을 열지 않는다.
// 이용 안내의 「정리방 들어가기」나 주소로 직접 들어와도 랜딩의 「PC에서 즐겨주세요」 화면(index.html#pc)으로 보낸다.
// app.html 맨 위에서 다른 것보다 먼저 읽는 일반 스크립트(CSP script-src 'self'로 허용).
if (matchMedia("(hover: none) and (pointer: coarse)").matches) location.replace("./index.html#pc");
