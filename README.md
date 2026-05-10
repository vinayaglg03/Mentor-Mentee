# 🚀 Mentor-Mentee Matching Platform

A modern web application that connects mentors and mentees based on their expertise, interests, and goals. This platform facilitates knowledge sharing, career guidance, and personal development through intelligent matching and seamless communication.

## ✨ Features

- **User Authentication** - Secure login and registration for mentors and mentees
- **Role-Based Access** - Separate dashboards and functionalities for mentors and mentees
- **Profile Management** - Detailed profiles with skills, interests, and goals
- **Smart Matching Algorithm** - Recommends compatible mentor-mentee pairs
- **Messaging System** - Real-time communication between matched pairs
- **Request Management** - Send, accept, and decline mentorship requests
- **Admin Dashboard** - Comprehensive management of users and platform settings

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI library
- **Vite** - Build tool
- **Tailwind CSS** - Styling framework
- **Lucide-React** - Icon library

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **Prisma** - ORM
- **JWT** - Authentication

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v14 or higher)

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Backend Setup
```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run dev
```

## ⚙️ Configuration

### Environment Variables

**Backend:** Create a `.env` file in the `backend` directory:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/mentor_database?schema=public"
JWT_SECRET="your_jwt_secret_key"
PORT=5000
```

**Frontend:** Create a `.env` file in the `frontend` directory:
```env
VITE_API_URL="http://localhost:5000"
```

## 📂 Project Structure

```
mentor-mentee/
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API services
│   │   ├── utils/       # Utility functions
│   │   └── App.jsx      # Main application component
│   ├── public/
│   └── package.json
│
├── backend/           # Node.js backend application
│   ├── prisma/
│   │   ├── schema.prisma  # Database schema
│   │   └── client.ts    # Prisma client
│   ├── src/
│   │   ├── controllers/ # Request handlers
│   │   ├── middlewares/ # Authentication & validation
│   │   ├── routes/      # API routes
│   │   └── index.ts     # Server entry point
│   ├── .env           # Environment variables
│   └── package.json
│
└── README.md          # Project documentation
```

## 📝 Usage
### Login Credentials
After running the backend, you can use these default credentials to log in:
**Admin:**
- Email: [EMAIL_ADDRESS]`
- Password: `admin123`

**Mentor:**
- Email: [EMAIL_ADDRESS]`
- Password: `mentor123`

**Mentee:**
- Email: [EMAIL_ADDRESS]`
- Password: `mentee123`

## 🚀 Running the App
1. **Start the backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open the app:**
   Visit `http://localhost:5173` in your browser

## 📊 Database Schema
The database consists of the following main tables:
- **User**: User accounts with role-based access
- **Profile**: Detailed user profiles with skills and interests
- **MentorshipRequest**: Requests for mentorship connections
- **Message**: Communication between mentors and mentees
- **Feedback**: User feedback on mentorship relationships

## 📁 Running Prisma Studio
To view and manage your database:
```bash
cd backend
npx prisma studio
```

## 📝 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing
Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For any issues or questions, please open an issue in the repository.
---

**Built with ❤️ for the mentorship community**