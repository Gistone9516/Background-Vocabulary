// 진입 화면 예시 입력 풀. 로케일별 ~50개에서 매번 랜덤 N개를 노출한다.
// 저위험(기술·창작·비즈니스)만 — 의료·법률 등 고위험 회피(칩 클릭은 chip()에서 HIGHRISK 검사됨).
import type { OutputLocale } from "@sidetab/shared";

const ko = [
  "졸업작품 모델이 자꾸 틀려요", "앱에 결제를 붙여야 해요", "추천 기능을 넣고 싶어요", "캐주얼 게임을 만들고 싶어요",
  "API를 연동해야 하는데 막막해요", "마케팅 데이터를 분석해야 해요", "투자 피칭 자료를 써야 해요", "웹사이트 속도를 높이고 싶어요",
  "챗봇을 직접 만들어보고 싶어요", "데이터베이스 설계가 어려워요", "디자인 시스템을 잡고 싶어요", "앱 출시 준비를 하고 있어요",
  "사용자 이탈을 줄이고 싶어요", "광고 성과를 분석하고 싶어요", "크롤러를 만들어야 해요", "클라우드로 서버를 옮기려 해요",
  "결제 보안이 걱정돼요", "이미지 분류 정확도를 올리고 싶어요", "음성 인식을 붙이고 싶어요", "실시간 채팅을 구현하고 싶어요",
  "SEO를 개선하고 싶어요", "앱 알림을 보내고 싶어요", "회원 가입 흐름을 다듬고 싶어요", "A/B 테스트를 해보고 싶어요",
  "로그를 어떻게 봐야 할지 모르겠어요", "배포 자동화를 하고 싶어요", "게임 밸런스를 잡고 싶어요", "캐릭터 애니메이션을 넣고 싶어요",
  "브랜드 로고를 정하고 싶어요", "영상 편집을 배우고 싶어요", "포트폴리오를 만들고 싶어요", "소설 플롯을 짜고 있어요",
  "유튜브 채널을 키우고 싶어요", "가격 정책을 정해야 해요", "고객 설문을 설계하고 싶어요", "재고 관리를 자동화하고 싶어요",
  "매출 예측을 해보고 싶어요", "스프레드시트가 너무 복잡해요", "업무 자동화를 하고 싶어요", "슬랙 봇을 만들고 싶어요",
  "3D 모델링을 시작하려 해요", "아두이노로 뭔가 만들고 싶어요", "드론을 직접 조립하고 싶어요", "스마트홈을 꾸미고 싶어요",
  "블록체인이 뭔지 알고 싶어요", "NFT를 발행해보고 싶어요", "개인정보를 안전하게 다루고 싶어요", "오픈소스에 기여하고 싶어요",
  "코딩 테스트를 준비하고 있어요", "사이드 프로젝트를 시작하고 싶어요",
];

const en = [
  "My capstone model keeps getting it wrong", "I need to add payments to my app", "I want to build a recommendation feature", "I want to make a casual game",
  "I have to integrate an API but I'm lost", "I need to analyze marketing data", "I have to write an investor pitch deck", "I want to speed up my website",
  "I want to build my own chatbot", "Database design is hard for me", "I want to set up a design system", "I'm preparing to launch my app",
  "I want to reduce user churn", "I want to analyze ad performance", "I need to build a web crawler", "I'm moving my server to the cloud",
  "I'm worried about payment security", "I want to improve image classification accuracy", "I want to add speech recognition", "I want to build real-time chat",
  "I want to improve my SEO", "I want to send app notifications", "I want to refine the sign-up flow", "I want to run an A/B test",
  "I don't know how to read my logs", "I want to automate deployment", "I want to balance my game", "I want to add character animation",
  "I want to settle on a brand logo", "I want to learn video editing", "I want to build a portfolio", "I'm plotting a novel",
  "I want to grow my YouTube channel", "I need to set my pricing", "I want to design a customer survey", "I want to automate inventory management",
  "I want to forecast sales", "My spreadsheet is too complex", "I want to automate my workflow", "I want to build a Slack bot",
  "I'm starting 3D modeling", "I want to build something with Arduino", "I want to assemble my own drone", "I want to set up a smart home",
  "I want to understand what blockchain is", "I want to mint an NFT", "I want to handle personal data safely", "I want to contribute to open source",
  "I'm preparing for coding interviews", "I want to start a side project",
];

const ja = [
  "卒業制作のモデルがよく外れます", "アプリに決済を組み込みたい", "レコメンド機能を入れたい", "カジュアルゲームを作りたい",
  "APIを連携したいけど手探りです", "マーケティングデータを分析したい", "投資ピッチ資料を書きたい", "サイトの表示を速くしたい",
  "自分でチャットボットを作りたい", "データベース設計が難しい", "デザインシステムを整えたい", "アプリのリリース準備中です",
  "ユーザー離脱を減らしたい", "広告の成果を分析したい", "クローラーを作りたい", "サーバーをクラウドに移したい",
  "決済のセキュリティが心配です", "画像分類の精度を上げたい", "音声認識を組み込みたい", "リアルタイムチャットを作りたい",
  "SEOを改善したい", "アプリ通知を送りたい", "会員登録の流れを整えたい", "A/Bテストをしてみたい",
  "ログの見方が分かりません", "デプロイを自動化したい", "ゲームバランスを調整したい", "キャラクターアニメーションを入れたい",
  "ブランドロゴを決めたい", "動画編集を学びたい", "ポートフォリオを作りたい", "小説のプロットを考えています",
  "YouTubeチャンネルを伸ばしたい", "価格設定を決めたい", "顧客アンケートを設計したい", "在庫管理を自動化したい",
  "売上を予測したい", "スプレッドシートが複雑すぎます", "業務を自動化したい", "Slackボットを作りたい",
  "3Dモデリングを始めたい", "Arduinoで何か作りたい", "ドローンを自分で組み立てたい", "スマートホームを作りたい",
  "ブロックチェーンが何か知りたい", "NFTを発行してみたい", "個人情報を安全に扱いたい", "オープンソースに貢献したい",
  "コーディング試験の準備中です", "サイドプロジェクトを始めたい",
];

const zh = [
  "毕业设计模型总是出错", "需要给应用接入支付", "想加入推荐功能", "想做一款休闲游戏",
  "要对接 API 但无从下手", "需要分析营销数据", "要写投资路演材料", "想提升网站速度",
  "想自己做一个聊天机器人", "数据库设计很难", "想搭建设计系统", "正在准备上线应用",
  "想降低用户流失", "想分析广告效果", "需要做一个爬虫", "想把服务器迁到云上",
  "担心支付安全", "想提升图像分类准确率", "想加入语音识别", "想实现实时聊天",
  "想改善 SEO", "想发送应用通知", "想优化注册流程", "想做 A/B 测试",
  "不知道怎么看日志", "想自动化部署", "想平衡游戏数值", "想加入角色动画",
  "想确定品牌 logo", "想学视频剪辑", "想做一个作品集", "正在构思小说情节",
  "想做大 YouTube 频道", "需要制定定价", "想设计客户问卷", "想自动化库存管理",
  "想预测销售额", "表格太复杂了", "想把工作流程自动化", "想做一个 Slack 机器人",
  "想开始 3D 建模", "想用 Arduino 做点东西", "想自己组装无人机", "想搭建智能家居",
  "想了解区块链是什么", "想发行一个 NFT", "想安全地处理个人信息", "想为开源做贡献",
  "正在准备编程面试", "想开始一个副业项目",
];

export const EXAMPLES: Record<OutputLocale, string[]> = { ko, en, ja, zh };

// 배열에서 n개를 무작위로 뽑는다(Fisher-Yates 부분 셔플). 앱 코드라 Math.random 사용 가능.
export function pickRandom<T>(arr: readonly T[], n: number): T[] {
  const a = arr.slice();
  const count = Math.min(n, a.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, count);
}
