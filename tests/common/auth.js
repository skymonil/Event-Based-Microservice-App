// tests/common/auth.js
import jwt from 'jsonwebtoken';

export const getSyntheticToken = () => {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
        throw new Error("❌ JWT_SECRET not found in environment. Check AnalysisTemplate!");
    }

    return jwt.sign(
        { 
            userId: "synthetic-test-runner", 
            isSynthetic: true 
        }, 
        secret, 
        { expiresIn: '10m' }
    );
};