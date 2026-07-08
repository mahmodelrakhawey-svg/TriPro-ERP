const cp = require('child_process');
const fs = require('fs');

const commits = ['e43c8bc', '58bb901'];
for (const commit of commits) {
    console.log(`Checking commit: ${commit}`);
    const files = cp.execSync(`git show --name-only --pretty="" ${commit}`).toString().split('\n').map(f => f.trim()).filter(Boolean);
    for (const file of files) {
        try {
            const content = cp.execSync(`git show ${commit}:"${file}"`).toString();
            if (content.includes('handleItemQuantityChange') || content.includes('paidItems')) {
                console.log(`  Found in file: ${file}`);
            }
        } catch (e) {
            // file might be deleted or binary
        }
    }
}
