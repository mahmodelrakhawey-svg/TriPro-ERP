const cp = require('child_process');

try {
    const files = cp.execSync('git show --name-only --pretty="" e43c8bc').toString().split('\n').map(f => f.trim()).filter(f => f.endsWith('.sql'));
    for (const file of files) {
        try {
            const content = cp.execSync(`git show e43c8bc:"${file}"`).toString();
            if (content.includes('process_split_payment')) {
                console.log(`Found process_split_payment in: ${file}`);
                const idx = content.indexOf('process_split_payment');
                console.log(content.slice(idx - 100, idx + 3000));
            }
        } catch (e) {}
    }
} catch (e) {
    console.error(e);
}
