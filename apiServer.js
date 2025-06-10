const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const MongoClient = require('mongodb').MongoClient;
const uri = 'mongodb+srv://12260590:admin123@cluster0.kkepkjp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(uri);
const { ObjectId } = require('mongodb');
const { Binary } = require('mongodb');

const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let userCollection;
let postCollection;

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB Atlas\n");

        const db = client.db('travel_sekai');
        userCollection = db.collection('users');
        postCollection = db.collection('posts');
    } catch (error) {
        console.error("MongoDB connection error: ", error + "\n");
    }
};

connectDB();

app.get('/', (req, res) => {
    res.send('Hello World!');
});

// verify user email and password during login
app.post('/verifyCredentials', async (req, res) => {
    console.log("POST request received successfully!");

    const userData = req.body;

    console.log(userData);
    try {
        const response = await userCollection.findOne({ email: userData.email, password: userData.password });
        console.log(`User find response: ${JSON.stringify(response)}`);
        res.status(200).send(JSON.stringify(response));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error })
    }

});

// check if the email is registered in the database before creating a new account
app.get('/checkUserEmail', async (req, res) => {
    console.log("GET request received successfully!");

    const userEmail = req.query.email;;

    try {
        const response = await userCollection.findOne({ email: userEmail });
        console.log(`Response: ${JSON.stringify(response)}`);
        res.status(200).send(JSON.stringify(response));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error });
    }
});

// create new user
app.post('/createNewUser', upload.single('userImage'), async (req, res) => {
    console.log("POST request received successfully");

    const user = req.body;

    let binaryValueOfImage = null;
    let contentType = null;

    if (req.file) {
        binaryValueOfImage = req.file.buffer;
        contentType = req.file.mimetype;
    }

    const userData = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        password: user.password,
        userImage: binaryValueOfImage ? {
            contentType: contentType,
            data: binaryValueOfImage
        } : null,
        dob: user.dob
    }

    try {
        const response = await userCollection.insertOne(userData);
        console.log(JSON.stringify(response));
        res.status(200).send(JSON.stringify(response));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error });
    }
});

app.get("/getUserInfo/:id", async (req, res) => {
    const userId = req.params.id;

    try {
        const user = await userCollection.findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 0 } }
        );

        const postCount = await postCollection.countDocuments({ userID: userId });

        if (user) {
            res.status(200).json({ ...user, postCount });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.toString() });
    }
});



// retrieve all the posts
app.get('/posts', async (req, res) => {
    console.log("GET request received successfully!");

    try {
        const posts = await postCollection.find({}).toArray();

        const serializedPosts = posts.map(post => {
            if (Array.isArray(post.images)) {
                post.images = post.images.map(img => {
                    let binaryData = [];

                    // Safely extract buffer from Binary and convert to array
                    if (img.binaryValueOfImage instanceof Binary || Buffer.isBuffer(img.binaryValueOfImage)) {
                        binaryData = Array.from(img.binaryValueOfImage.buffer || img.binaryValueOfImage);
                    }

                    return {
                        ...img,
                        binaryValueOfImage: binaryData
                    };
                });
            }
            return post;
        });

        res.status(200).json(serializedPosts);
    } catch (error) {
        console.error("Error in GET /posts:", error);
        res.status(500).json({ message: "Server error", error: error });
    }
});


// retrieve one post using the post id
app.get('/posts/:id', async (req, res) => {
    console.log("GET request received successfully!");

    const postID = req.params.id;

    try {
        const response = await postCollection.findOne({ _id: new ObjectId(postID) });
        console.log(`Post with ID ${postID}: ${JSON.stringify(response)}`);

        if (!response) {
            return res.status(400).json({ message: "Post not found" });
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error });
    }
});


// retrieve posts created by user
app.get('/getUserPosts/:userId', async (req, res) => {
    console.log("GET request received successfully!");

    const userID = req.params.userId;

    console.log("User ID: " + userID);

    try {
        const response = await postCollection.find({ userID: userID }, {
            projection: {
                "images": { $slice: 1 },
                "postTitle": 1,
                "route": 1,
                "date": 1
            }
        }).toArray();
        console.log(`Posts: ${JSON.stringify(response)}`);
        res.setHeader("Content-Type", "application/json");
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error });
    }
});


// create new post
app.post('/createPost', upload.any(), async (req, res) => {
    console.log("POST request received successfully!");

    const post = req.body;
    const imagefiles = req.files;

    console.log("Uploaded files: ", imagefiles.map(file => file.fieldname));

    const postImages = imagefiles.map(file => ({
        filename: file.originalname,
        contentType: file.mimetype,
        binaryValueOfImage: file.buffer
    }));

    let journeys = [];

    try {
        journeys = JSON.parse(post.journeys || '[]');
    } catch (err) {
        return res.status(400).json({ message: "Invalid JSON in 'journeys' field" });
    }

    const routeData = journeys.map(journey => ({
        locationName: journey.locationName,
        description: journey.description,
        modeOfTransport: journey.modeOfTransport,
        distanceAndTime: journey.distanceAndTime
    }));

    const postData = {
        postTitle: post.postTitle,
        date: post.date,
        route: routeData,
        accommodation: post.accommodation,
        userID: post.userID,
        endDate: post.endDate,
        startDate: post.startDate,
        userID: post.userID,
        images: postImages
    };

    try {
        const response = await postCollection.insertOne(postData);
        console.log(JSON.stringify(response));
        res.status(200).send(JSON.stringify(response));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error });
    }

});

app.put('/editPost/:postId', upload.any(), async (req, res) => {
    console.log("PUT request received successfully!");

    const postID = req.params.postId;
    const post = req.body;
    const imageFiles = req.files;

    let existingPost;
    try {
        existingPost = await postCollection.findOne({ _id: new ObjectId(postID) });
        if (!existingPost) {
            return res.status(404).json({ message: "Post not found" });
        }
    } catch (err) {
        return res.status(500).json({ message: "Error retrieving post", error: err.toString() });
    }

    let images = existingPost.images || [];

    if (imageFiles.length > 0) {
        const newImages = imageFiles.map(file => ({
            filename: file.originalname,
            contentType: file.mimetype,
            binaryValueOfImage: file.buffer
        }));
        images = images.concat(newImages);
    }

    let journeys;
    try {
        journeys = JSON.parse(post.journeys || '[]');
    } catch (error) {
        return res.status(400).json({ message: "Invalid journeys format" });
    }

    const routeData = journeys.map(journey => ({
        locationName: journey.locationName,
        description: journey.description,
        modeOfTransport: journey.transportMode,
        distanceAndTime: journey.distanceAndTime
    }));

    const updatedData = {
        postTitle: post.postTitle,
        date: post.date,
        route: routeData,
        accommodation: post.accommodation,
        userID: post.userID,
        startDate: post.startDate,
        endDate: post.endDate,
        images: images
    };

    try {
        const response = await postCollection.updateOne(
            { _id: new ObjectId(postID) },
            { $set: updatedData }
        );

        if (response.matchedCount === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.toString() });
    }
});

app.delete('/deletePost/:postId', async (req, res) => {
    console.log("DELETE request received successfully!");

    const postID = req.params.postId;

    try {
        const response = await postCollection.deleteOne({ _id: new ObjectId(postID) });

        if (response.deletedCount == 0) {
            return res.status(404).json({ message: "Post not found or already deleted" });
        }

        res.status(200).send(JSON.stringify(response));
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.toString() });
    }

})

app.listen(port, () => {
    console.log(`App is running on port ${port}`);
});