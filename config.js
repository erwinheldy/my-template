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
    watch: 'dist',
    verbose: false,
  },
  useDartSass: false,
  customConfig: 'my-template.config.js'
}
