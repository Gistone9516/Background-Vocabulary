// MV3 서비스워커. 이벤트 처리와 사이드패널 열기만 담당한다.
// 스트리밍 fetch는 절대 여기서 하지 않는다.
// MV3 서비스워커는 30초 fetch 제한이 있어 긴 스트림이 중간에 끊긴다.

// 확장 아이콘 클릭 시 사이드패널을 연다.
// chrome.sidePanel.open은 사용자 제스처(클릭) 컨텍스트에서만 호출 가능하다.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.sidePanel
    .open({ tabId: tab.id })
    .catch((err: unknown) => {
      // 패널이 이미 열려 있거나 권한이 없는 탭에서 오류가 날 수 있다.
      console.error("[sidetab sw] sidePanel.open 실패:", err);
    });
});

// 확장이 처음 설치되거나 업데이트될 때 기본 동작을 설정한다.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[sidetab sw] 설치 완료.");
  } else if (details.reason === "update") {
    console.log("[sidetab sw] 업데이트 완료. 버전:", details.previousVersion);
  }
});

// 서비스워커가 살아있음을 알리는 최소 heartbeat 리스너.
// 아무 작업도 하지 않지만 MV3가 워커를 비활성화하지 않도록 등록해 둔다.
chrome.runtime.onMessage.addListener((_msg, _sender, sendResponse) => {
  sendResponse({ alive: true });
  return false;
});
