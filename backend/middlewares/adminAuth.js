const checkAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'الوصوع محظور: تحتاج صلاحيات أدمن',
      code: 'FORBIDDEN_ACCESS'
    });
  }
  next();
};

module.exports = checkAdmin;
