/**
 * CoziumHelper.exe 시작점. tools/build-helper-exe.mjs가 이 파일을 desktop-helper.mjs와 함께
 * CommonJS 한 덩어리로 묶어 Node 단일 실행 파일(SEA)에 넣는다.
 *
 * node로 실행할 때와 다른 점은 하나뿐이다: 더블클릭으로 열린 창은 실패하면 바로 닫혀서
 * 오류를 읽을 수 없으니, 시작에 실패하면 Enter를 누를 때까지 창을 붙잡아 둔다.
 */
import { main } from "./desktop-helper.mjs";

process.title = "Cozium Desktop Helper";

function holdWindow(code) {
  console.error("\nEnter를 누르면 창이 닫힙니다.");
  if (!process.stdin.isTTY) process.exit(code);
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(code));
}

// 실행 중 예상 못 한 오류로 꺼질 때도 창이 바로 닫히지 않게 한다(10-20). 이유를 읽고 Enter로 닫는다.
for (const event of ["uncaughtException", "unhandledRejection"]) {
  process.on(event, (error) => {
    console.error(`\nHelper가 예상 못 한 오류로 멈췄습니다: ${error?.stack ?? error}`);
    holdWindow(1);
  });
}

main(process.argv.slice(2)).then(
  (result) => {
    // --help는 null을 돌려준다. 도움말을 읽을 수 있게 창을 잡아 둔다.
    if (result === null) holdWindow(0);
  },
  (error) => {
    console.error(`시작 실패: ${error?.message ?? error}`);
    holdWindow(1);
  },
);
