module.exports = {
  path: {
    html: {
      src: 'src/ejs',
      dst: 'dist/html',
    },
    css: {
      src: 'src/scss',
      dst: 'dist/css',
    },
    js: {
      dst: 'dist/js',
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: false,
    watch: 'dist',
    logLevel: 0,
  },
  customConfig: 'my-template.js'
}
