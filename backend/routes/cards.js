
// ./backend/routes/cards.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json([
    {
        whichTab: "apps",
        title: "التطبيقات",
        icon: "apps_tab.png",
        logo: "logo.png"
      },
      {
        whichTab: "games",
        title: "الألعاب",
        icon: "games_tab.png",
        logo: "logo.png"
      },
      {
        whichTab: "cryptos",
        title: "العملات الرقمية",
        icon: "cryptos_tab.png",
        logo: "logo.png"
      },
      {
        whichTab: "balances",
        title: "تعبئة رصيد",
        icon: "balance_tab.png",
        logo: "logo.png"
      }
  ]);
});

module.exports = router;