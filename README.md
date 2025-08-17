# Top4CryptoShop

A cryptocurrency shop application built with Node.js, Express, and MongoDB.

## Features

- User authentication (register, login, logout)
- Session management with MongoDB storage
- Rate limiting for security
- Responsive design with 3D effects
- Dark/Light theme support
- Application grid with 3D cards
- Wallet and payment management

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or remote instance)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Top4CryptoShop
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies (if any):
```bash
cd ../frontend
# If there are frontend dependencies
npm install
```

4. Create a `.env` file in the `backend` directory with the following variables:
```env
NODE_ENV=development
PORT=10000
MONGODB_URI=mongodb://127.0.0.1:27017/Top4CryptoShop
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret
CSRF_SECRET=your-csrf-secret
```

## Running the Application

### Development Mode

```bash
# From the root directory
npm run dev
```

### Production Mode

```bash
# From the root directory
npm start
```

## Project Structure

```
Top4CryptoShop/
├── backend/
## Authentication Documentation

### Login Methods
- **Traditional Login**: Use username and password
- **Google Login**: Click the "Login via Google" button
- **Apple Login**: Click the "Login via Apple" button

### Security Features
- Passwords are encrypted using bcrypt
- JWT tokens are generated upon successful login
- Session management with MongoDB storage
- Rate limiting to prevent brute force attacks
- CSRF protection for all forms

### Registration Methods
- **Traditional Registration**: Fill out the form with required data
- **Google Registration**: Click the "Register via Google" button
- **Apple Registration**: Click the "Register via Apple" button

### Logout Process
- Tokens are revoked and added to a blacklist
- Cookies are cleared from the browser
- Session is securely terminated
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── .env
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── public/
│   │   ├── assets/
│   │   ├── index.html
│   │   └── ...
│   └── ...
├── README.md
└── package.json
```

## API Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/check-session` - Check authentication status

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- CSRF protection
- Rate limiting
- Session management with MongoDB storage
- Cookie security settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a pull request

## License

This project is licensed under the MIT License.