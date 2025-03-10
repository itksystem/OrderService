const express = require('express');
const bodyParser = require('body-parser');
const orderRoutes = require('./routes/orders');


const app = express();
app.use(bodyParser.json({ type: 'application/json' }));

app.use(function(request, response, next){
  console.log(request);  
  next();
});

app.use('/api/orders', orderRoutes);

app.listen(process.env.PORT, () => {
  console.log(`
    ******************************************
    * Order Service running on port ${process.env.PORT} *
    ******************************************`);
});

