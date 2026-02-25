const { getGlobalStats, getAdminRecentChecks, getAllUsers, getSetting } = require('./src/lib/db');
const fs = require('fs');

const data = {
    stats: getGlobalStats(),
    recentChecks: getAdminRecentChecks(20),
    users: getAllUsers(),
    config: {
        guest_mode: getSetting('guest_mode', 'true'),
        public_signup: getSetting('public_signup', 'true')
    }
};

fs.writeFileSync('admin_data_dump.json', JSON.stringify(data, null, 2));
console.log("Admin Data Dumped to admin_data_dump.json");
