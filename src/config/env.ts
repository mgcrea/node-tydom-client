export const USER_AGENT = process.env.TYDOM_USER_AGENT || 'Tydom/255 CFNetwork/1125.2 Darwin/19.4.0';
export const NODE_UNHANDLED_REJECTIONS = process.env.NODE_UNHANDLED_REJECTIONS;
const NODE_MAJOR_VERSION = parseInt(process.versions.node.split('.')[0], 10);

if (NODE_MAJOR_VERSION < 15 && NODE_UNHANDLED_REJECTIONS === 'strict') {
  process.on('unhandledRejection', (err) => {
    console.error(err);
    process.exit(1);
  });
}
