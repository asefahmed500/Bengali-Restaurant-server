// Load environment variables first


const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const logger = require('./logger');
require('dotenv').config();

// Initialize Stripe after environment variables are loaded
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// Middleware

app.use(cors())

app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8vksczm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    // await client.connect();

    const menuCollection = client.db("ResturantDB").collection("menu");
    const userCollection = client.db("ResturantDB").collection("users");
    const reviewsCollection = client.db("ResturantDB").collection("reviews");
    const cartsCollection = client.db("ResturantDB").collection("carts");
    const paymentCollection = client.db("ResturantDB").collection("payments");

    // JWT APIs
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      });
      res.send({ token });
    });

    // Middlewares
    const verifyToken = (req, res, next) => {
      console.log('Inside verifyToken, Authorization Header:', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Verify Admin Middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }
      next();
    };

    // User APIs
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const admin = user?.role === 'admin';
      res.send({ admin });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Menu APIs
    // app.get('/menu', async (req, res) => {
    //   const result = await menuCollection.find().toArray();
    //   console.log(result);
    //   res.send(result);
    // });

    app.get('/menu', async (req, res) => {
      try {
        const result = await menuCollection.find().toArray();
        console.log('Fetched menu items:', result);
        res.send(result);
      } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).send({ message: 'Failed to fetch menu' });
      }
    });


    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      console.log(result);
      res.send(result);
    });

    app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
        }
      };

      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          console.error('Invalid ID format:', id);
          return res.status(400).send({ message: 'Invalid ID format' });
        }

        const query = { _id: new ObjectId(id) };
        const result = await menuCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          console.error('No document found with ID:', id);
          return res.status(404).send({ message: 'No document found with the provided ID' });
        }

        res.send(result);
      } catch (error) {
        console.error('Failed to delete item:', error);
        res.status(500).send({ message: 'Failed to delete item' });
      }
    });

    // Reviews API

    
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // Carts Collection
    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      console.log("Received cart item:", cartItem);
      if (!cartItem.email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const result = await cartsCollection.insertOne(cartItem);
      console.log("Insert result:", result);
      res.send(result);
    });

    app.get('/carts', async (req, res) => {
      try {
        const email = req.query.email;
        console.log("Requested email:", email);
        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }
        const query = { email: email };
        const cartItems = await cartsCollection.find(query).toArray();
        console.log("Fetched cart items:", cartItems);
        res.send(cartItems);
      } catch (error) {
        console.error("Failed to fetch cart items:", error);
        res.status(500).send({ message: "Failed to fetch cart items" });
      }
    });

    app.delete('/carts/:id', async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await cartsCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.send({ deletedCount: result.deletedCount });
        } else {
          res.status(404).send({ deletedCount: 0 });
        }
      } catch (error) {
        console.error('Failed to delete item:', error);
        res.status(500).send({ message: 'Failed to delete item' });
      }
    });

    // Payment Intent
    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden Access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ['card']
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ message: "Failed to create payment intent" });
      }
    });

    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body;
      try {
        const paymentResult = await paymentCollection.insertOne(payment);
        console.log(payment);
        const query = {
          _id: {
            $in: payment.cartIds.map(id => new ObjectId(id))
          }
        };
        const deleteResult = await cartsCollection.deleteMany(query);
        res.send({ paymentResult, deleteResult });
      } catch (error) {
        console.error("Failed to process payment:", error);
        res.status(500).send({ message: "Failed to process payment" });
      }
    });

    // stats admin 

    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total , payment) => total + payment.price , 0)


      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }

        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;




      res.send({
        users,
        menuItems,
        orders,
        revenue
      })

    })

    app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection.aggregate([
        {
          $unwind: '$menuItemIds'
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: { $sum: '$menuItems.price' }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray();

      res.send(result);

    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Restaurant server is running');
});

app.listen(port, () => {
  console.log(`Restaurant Server Is Running on port ${port}`);
});
