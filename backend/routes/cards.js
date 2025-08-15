const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json([
    {
        whichTab: "apps",
        title: "التطبيقات",
        icon: "./icons/appstab/apps_tab.png",
        logo: "./assets/images/logo.png"
      },
      {
        whichTab: "smallCards",
        title: "الألعاب",
        icon: "./assets/images/logo.png",
        logo: "./assets/images/favicon.ico"
      },
      {
        whichTab: "smallCards",
        title: "العملات الرقمية",
        icon: "./assets/images/logo.png",
        logo: "./assets/images/favicon.ico"
      },
      {
        whichTab: "smallCards",
        title: "تعبئة رصيد",
        icon: "./assets/images/logo.png",
        logo: "./assets/images/favicon.ico"
      }
  ]);
});

module.exports = router;