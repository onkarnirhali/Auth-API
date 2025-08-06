auth-api/
│
├── src/
│   ├── config/
│   │   └── db.js           # PostgreSQL config
│   │   └── passport.js     # Google OAuth strategy
│   ├── routes/
│   │   └── authRoutes.js   # Auth endpoints
│   ├── controllers/
│   │   └── authController.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── models/
│   │   └── userModel.js
│   └── server.js
│
├── .env
└── package.json