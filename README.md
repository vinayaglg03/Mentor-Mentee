# Mentor-Mentee
<b>Academic Mentor Intelligence System (AMIS)<b>
Overview

Academic Mentor Intelligence System (AMIS) is a centralized academic analytics and mentor–mentee management platform designed for educational institutions. The system enables mentors and Heads of Department (HODs) to track, manage, and analyze student academic performance semester-wise through interactive dashboards and intelligent analytics.

AMIS helps institutions identify at-risk students, monitor progress trends, manage mentor assignments, and maintain complete academic records in a structured and scalable manner.

Features
Mentor Module
Add and manage students
Add semester-wise subjects and marks
Record achievements and progress logs
Monitor student performance trends
Generate alerts for weak academic performance
View analytics and performance charts
HOD Module
Institution-wide academic analytics
View all mentor and student records
Semester-wise student performance tracking
Risk analysis and alert monitoring
Performance comparison dashboards
Mentor insights and reporting
Tech Stack
Frontend
React.js
CSS3 / Modern UI Components
Framer Motion (animations)
Chart.js / Recharts
Backend
Node.js
Express.js
Database
PostgreSQL
Prisma ORM
Core Functionalities
Semester-wise Academic Tracking

Each student maintains:

Semester records
Subject-wise marks
Achievements
Alerts
Progress logs
Intelligent Performance Analytics

The system provides:

Performance trends
Risk detection
Academic analytics
Mentor insights
Student comparison
Role-Based Access
Mentor

Can manage only assigned students.

HOD/Admin

Can view institution-wide academic data and analytics.

Academic Scoring Logic
Semester 1–2
Internal 1: out of 50
Internal 2: out of 50
Final Internal = Average of Internal 1 & 2
External: out of 50
Final Score = Internal + External
Semester 3–7
Internal 1: out of 25
Internal 2: out of 25
Assignment: out of 25
Final Internal = Average of Internal 1 & 2 + Assignment
External: out of 50
Final Score = Internal + External

Maximum Final Score = 100

Database Modules
Users
Students
Subjects
Scores
Alerts
Progress Logs
Achievements
Academic Sessions
UI/UX Highlights
Modern SaaS-style dashboard UI
Responsive design
Interactive charts and analytics
Smooth animations and transitions
Professional academic ERP appearance
Semester timeline navigation
Installation
Clone Repository
git clone <repository-url>
Frontend Setup
cd frontend
npm install
npm run dev
Backend Setup
cd backend
npm install
npm run dev
Prisma Setup
npx prisma generate
npx prisma db push
Environment Variables

Create a .env file inside backend folder:

DATABASE_URL="postgresql://username:password@localhost:5432/mentor_database?schema=public"
JWT_SECRET="your_secret_key"
PORT=5000
Future Enhancements
AI-based performance prediction
Attendance integration
PDF report generation
Notification system
Student portal
Email alerts
SGPA/CGPA analytics
Exportable reports
Team Members
Vinaya
Tayibba
Prachia
Saman
Conclusion

AMIS is designed to modernize academic mentor–student management by combining semester-wise academic tracking, intelligent analytics, and centralized dashboards into a single professional platform. The system improves mentor efficiency, enables proactive academic monitoring, and provides institutions with actionable academic insights.
