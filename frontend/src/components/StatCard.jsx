import React from 'react';
import { motion } from 'framer-motion';
import './StatCard.css';

const StatCard = ({ title, value, icon: Icon, type = 'primary' }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className="stat-card"
    >
      <div className={`stat-icon icon-${type}`}>
        {Icon && <Icon size={24} />}
      </div>
      <div className="stat-details">
        <h3>{title}</h3>
        <p>{value}</p>
      </div>
    </motion.div>
  );
};

export default StatCard;
