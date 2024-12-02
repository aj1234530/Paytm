const { PrismaClient } = require("@prisma/client");
require("dotenv").config();
const prisma = new PrismaClient();
const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const JWT_SECRET = "sfsdfjsjlsdfljdfljsdgjskddjfhlsdkjgsdfsf";
const cors = require("cors");

app.use(cors());

app.use(express.json());
app.get("/user", (req, res) => {
  console.log("hello get");
  res.json({ message: "hello world" });
});

//auth routes(signup,login, validateSession)
app.post("/signup", async (req, res) => {
  //auth:signup
  console.log("signup request made");
  const { name, email, password } = req.body;

  //debug
  console.log(name, email, password);
  if (!name) {
    console.log("name req", name);
  }
  if (!email) {
    console.log("email req", email);
  }
  if (!password) {
    console.log("password req", password);
  }

  if (!name || !email || !password) {
    return res.status(400).json({ message: "all fields manadatory" });
  }
  const user = await prisma.auth.findUnique({ where: { email: email } });
  console.log(user); //debug
  if (user)
    return res.status(409).json({ message: "email exists, please login" });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const signupUser = await prisma.auth.create({
      data: { name: name, email: email, password: hashedPassword },
    });
    const token = jwt.sign({ userId: email }, JWT_SECRET, { expiresIn: "5h" });
    res.status(200).json({ message: "signup successful", token: token });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
});
app.post("/login", async (req, res) => {
  //auth:login

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "all fields manadatory" });
  }
  try {
    const user = await prisma.auth.findUnique({ where: { email: email } });
    if (!user) {
      return res
        .status(400)
        .json({ message: "You do not exist in our db, signup first" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ message: "Wrong password , double check" });
    }
    res.status(200).json({
      message: "login successful",
      token: jwt.sign({ userId: email }, JWT_SECRET, { expiresIn: "5h" }),
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
});
const validateSession = (req, res, next) => {
  //middleware for session manage by jwt
  const token = req.headers["authorization"]?.split(" ")[1]; //rem headers //do write Bearer in header after sending the request
  if (!token) {
    return res.status(401).json({ message: "no token provided" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log(req.user, "validated");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
};

//onboarding user after the successful registration  - this route now allows to have diff email for onboarding but have relate auth model so that user's email authomatic fetched or email no need to be here
app.post("/onboard", validateSession, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { email: req.user.userId },
  });

  if (!user) {
    return res.status(400).json({ message: "You already have a wallet" });
  }
  const { email, name } = req.body;
  // Ensure the email and name are provided
  if (!email || !name) {
    return res.status(400).json({ error: "Email and name are required" });
  }

  try {
    // Create the user with the given name, email, and initial balance
    const user = await prisma.user.create({
      data: {
        name: name,
        email: email,
        balance: 1000, // given 1000 initial balance
      },
    });

    // Send a successful response with status 201
    res.status(201).json(user);
  } catch (error) {
    // Handle any errors during the user creation
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
app.post("/transfer", validateSession, async (req, res) => {
  const { toUserEmail, fromUserEmail, amount } = req.body;
  if (!toUserEmail || !fromUserEmail || !amount) {
    return res.status(400).json({ message: "all required" });
  }
  try {
    await prisma.$transaction(async (prisma) => {
      //$transaction takes a funtion as an argument , and within function we define operations, "async(prisma)=>{}" - this is that fxn here //all operations inside this function runs together
      const fromUser = await prisma.user.findUnique({
        where: { email: fromUserEmail },
      });
      const toUser = await prisma.user.findUnique({
        where: { email: toUserEmail },
      });
      //checking users if existx
      if (!fromUser || !toUser) {
        return res.status(409).json({ message: "users not found" });
      }
      if (fromUser.balance < amount) {
        return res.status(409).json({ message: "Insufficient balance" });
      }
      await prisma.user.update({
        where: { email: fromUserEmail },
        data: { balance: fromUser.balance - amount },
      });
      await prisma.user.update({
        where: { email: toUserEmail },
        data: { balance: toUser.balance + amount },
      });
      await prisma.transaction.create({
        data: { userId: fromUserEmail, amount: -amount, type: "transfer" },
      });
      await prisma.transaction.create({
        data: { userId: toUserEmail, amount: amount, type: "transfer" },
      });
      res.status(200).json({ message: "transaction was successful" });
      console.log("transction was a success"); //debug
    });
  } catch (error) {
    console.log(error);
    res
      .status(400)
      .json({ message: "some error occured", error: error.message });
  }
});
app.get("/recent-transactions", validateSession, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { email: email },
      include: { transactions: true },
    });
    console.log(user);
    if (!user) {
      return res.status(400).json({ message: "wrong email" });
    }
    const transactions = user.transactions;
    if (!transactions) {
      return res
        .status(200)
        .json({ message: "You don't have any transactions" });
    }
    res.status(200).json({ transactions: transactions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
const bankResponse = (req, res, next) => {
  //next must be passed
  const email = req.user.userId;
  console.log(email);

  const token = true; // it won't be accessible in the next handler as it is scoped here //
  req.bankVerified = token; //so adding toke to request object
  next();
};
//add money
app.post("/addmoney", validateSession, bankResponse, async (req, res) => {
  const email = req.user.userId;
  console.log(email);
  const { amount } = req.body;
  if (!amount) {
    return res.status(200).json({ message: "please fill a valid amount" });
  }
  if (!req.bankVerified) {
    return res.status(400).json({ message: "refused by bank" });
  }
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { email: email },
        data: { balance: { increment: amount } }, //use the increment prop of prisma
      }),
      prisma.transaction.create({
        data: { userId: email, amount: amount, type: "deposit" },
      }),
    ]);
    res.status(200).json({ message: `{amount} money added successfully` });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
const bankWithdrawResponse = (req, res, next) => {
  const token = true;
  req.widthdrawApproved = token;
  next();
};
app.get(
  "/withdraw",
  validateSession,
  bankWithdrawResponse,
  async (req, res) => {
    const { amount } = req.body;
    const email = req.user.userId;
    if (!req.widthdrawApproved) {
      return res.status(400).json({ message: "Refused by the bank" });
    }
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { email: email },
          data: { balance: { decrement: amount } },
        }),
        prisma.transaction.create({
          data: { userId: email, type: "withdrawl", amount: amount },
        }),
      ]);
      res.status(200).json({ message: "withdraw success" });
    } catch (error) {
      console.log(error);
      res.status(400).json({ message: error.message });
    }
  }
);

app.listen(3001, () => console.log("listening on 3001"));

//  note: we cannot const inside to assign -(common sense , this array has list of quesries)   const is used for variable declarations, and variable declarations like const or let are not allowed inside array or object literals in JavaScript
//       const fromUser = await prisma.user.findUnique({
//         where: { email: fromUserEmail },
//       });
//       const toUser = await prisma.user.findUnique({
//         where: { email: toUserEmail },
//       });
//       // Ensure both users exist
//       if (!fromUser || !toUser) {
//         throw new Error("One or both users not found");
//       }
//       if (fromUser.balance < amount) {
//         throw new Error("Insufficient balance");
//       }
// const transactions = [
//     prisma.user.update({
//       where: { email: fromUserEmail },
//       data: { balance: fromUser.balance - amount },
//     }),
//     prisma.user.update({
//       where: { email: toUserEmail },
//       data: { balance: toUser.balance + amount },
//     }),
//     prisma.transaction.create({
//       data: { userId: fromUser.id, amount: -amount, type: "transfer" },
//     }),
//     prisma.transaction.create({
//       data: { userId: toUser.id, amount: amount, type: "transfer" },
//     }),]
//await prisma.$transactions(transaction)  - executing all queries
