// Compatibility projection for older builds only.
// New Web / Standalone builds read notifications.js from the Vault feed.
window.__64PE_UPDATE__ = {
  enabled: true,
  schemaVersion: 2,
  notices: [
    {
      id: "desktop-1.6.12-release",
      target: "desktop",
      latestVersion: "1.6.12",
      title: {
        ja: "64Pad Explorer Desktop v1.6.12",
        en: "64Pad Explorer Desktop v1.6.12"
      },
      message: {
        ja: "UST表示にルートからの相対度数を追加し、Push 3でも同じ表記を表示します。",
        en: "UST labels now include the relative degree from the root, with the same notation on Push 3."
      },
      url: "https://murinaikurashi.com/pad-sensei-products/?utm_source=64pad&utm_medium=update-notice&utm_campaign=desktop-products",
      cta: {
        ja: "製品ページで確認",
        en: "View product page"
      },
      icon: "📦"
    },
    {
      id: "web-v6.7.18-release",
      target: "web",
      latestVersion: "6.7.18",
      title: {
        ja: "64Pad Explorer Web v6.7.18",
        en: "64Pad Explorer Web v6.7.18"
      },
      message: {
        ja: "Push 3入力中のモード切り替えとTo DAWのベース音域を改善しました。",
        en: "Push 3 input is more stable, and To DAW handles slash-bass range more reliably."
      },
      url: "https://murinaikurashi.com/64-pad-explorer-manual/update-history/",
      cta: {
        ja: "詳細を見る",
        en: "See details"
      },
      icon: "🛠"
    },
    {
      id: "pad-sensei-mk1-on-sale",
      target: "all",
      title: {
        ja: "Pad Sensei MK1",
        en: "Pad Sensei MK1"
      },
      message: {
        ja: "発売しました。",
        en: "Now available."
      },
      url: "https://buy.stripe.com/14AcN788zdAN2h04zJ0Ny00",
      cta: {
        ja: "購入する",
        en: "Buy now"
      },
      icon: "•"
    }
  ]
};
