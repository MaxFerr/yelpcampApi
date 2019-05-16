const express=require('express');
const bodyParser=require('body-parser');
const cors=require('cors');
const knex=require('knex');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require("crypto");
const fetch = require('node-fetch');
const Clarifai = require('clarifai');

const db=knex({
	client:'pg',
	connection:{
		connectionString:process.env.DATABASE_URL,
		ssl: true		
	}
});


const app=express();
app.use(bodyParser.json());
app.use(cors());


app.get('/',(req,res)=>{
	//getting all the camps from the db and sending it to the FE
	db.select('*').from('camps').then(camps=>{		
		res.json(camps)
	})
})

app.get('/Shop',(req,res)=>{
	//getting all the shop items from the db and sending it to the FE
	db.select('*').from('shop_items').then(items=>{
		res.json(items)
	})
})

//a changer dans FE user
app.get('/admin/:id',(req,res)=>{
	const {id}=req.params;	
	//security check (if the user is an admin)
	//if the id received from the FE = admin id stored in process.env : respond admin id 
	if(Number(id)===Number(process.env.admin_id)){ //process.env.admin_id
		return res.json(process.env.admin_id) //process.env.admin_id
	}else{
		return res.json('Error.')
	}		
})

app.post('/newcamp',(req,res)=>{
	const {img,name,location,price,description,user_id}=req.body;
	//turning a string into an array of strings and then look for { (filter) if there is one
		//or if the string is empty
		// res error
		//else insert data in the db
	if(!img||
		img.split('').filter(x => x === '{').length === 1||		
		!name||
		name.split('').filter(x => x === '{').length === 1
		||		
		!location||
		location.split('').filter(x => x === '{').length === 1
		||		
		!price||
		price.split('').filter(x => x === '{').length === 1
		||		
		!description||
		description.split('').filter(x => x === '{').length === 1
		){
		return res.status(400).json('Incorrect form.')
}else{
	db('camps')
	.returning('*')
	.insert({
		image:img,
		camps_name:name,
		loacation:location,
		description:description,
		added:new Date(),
		price:price,
		user_id:user_id
	})
	.then(camp=>{
		res.json(camp[0])
	})
	.catch(err=> res.status(400).json('Unable to add that camp'))
	}
})

app.post('/login',(req,res)=>{
	const {email,password}=req.body;
		//turning a string into an array of strings and then look for { (filter) if there is one
		//or if the string is empty
		// res error
		//else compare pass and email with the db
	if(!email||
		email.split('').filter(x => x === '{').length === 1||		
		!password||
		password.split('').filter(x => x === '{').length === 1){
		return res.status(400).json('Incorrect form.')
}else{
	db.select('email','password').from('login')
	.where('email','=',email)
	.then(loginInfo=>{
		//using bcrypt to compare FE password with db password where FE email === db email
		bcrypt.compare(password, loginInfo[0].password, function(err, check) {		 
			if(check) {
				return db.select('*').from('users')
				.where('email','=',loginInfo[0].email)
				.then(user=>{
					res.json(user[0])
				})
				.catch(err=>res.status(400).json('unable to connect'))
			}else {
				res.status(400).json('error')
			} 
		});		
	})
	.catch(err=>res.status(400).json('Wrong password or email.'))
}
	
})

app.post('/register',(req,res)=>{	
	const {email,name,password}=req.body;
	//turning a string into an array of strings and then look for { (filter) if there is one
		//or if the string is empty
		// res error
		//else insert data in the db
	if(!email||
		email.split('').filter(x => x === '{').length === 1||		
		!password||
		password.split('').filter(x => x === '{').length === 1
		||		
		!name||
		name.split('').filter(x => x === '{').length === 1
		){
		return res.status(400).json('Incorrect form.')
}else{
	//hash password using bcrypt
	bcrypt.genSalt(10, function(err, salt) {
    bcrypt.hash(password, salt, function(err, hash) {
    	//use transaction to work on 2 tables at the same time(login and users table) 
        db.transaction(trx=>{
        	//insert hashed password into the db
		trx.insert({
			password:hash,
			email:email
		})
		.into('login')
		.returning('email')
		.then(loginEmail=>{

		return trx('users')
			.returning('*')
			.insert({
				email:loginEmail[0],
				name:name,
				created_at: new Date()
			})
			.then(user=>{
				res.json(user[0])
			})
		})
		.then(trx.commit)
		.catch(trx.rollback)
	})
		.catch(err=>res.status(400).json('Email or username already used.'))
		})
    });
}	
});
	

app.post('/newComment',(req,res)=>{
	const {comment_text,camp_id,user_id,comment_added}=req.body;
	//turning a string into an array of strings and then look for { (filter) if there is one
		//or if the string is empty
		// res error
		//else insert data received from the FE in the db
	if(!comment_text||
		comment_text.split('').filter(x => x === '{').length === 1
		){
		return res.status(400).json('Incorrect form.')
	}else{
		db('comments')
			.returning(['comment_id','comment_text'])	
			.insert({
				comment_text:comment_text,
				camp_id:camp_id,
				user_id:user_id,
				comment_added:comment_added		
			}).then(data=>{
				res.json(data[0])
			})
			.catch(err=> res.status(400).json('Unable to add that comment'))
	}
	
})

app.get('/allComment/:id',(req,res)=>{
	//getting camp and all the comments from that camp
	//join comments table with camps table where camp id = id received from FE
	const {id}=req.params;
	db.from('comments').innerJoin('camps', 'camps.id', 'comments.camp_id')
	.innerJoin('users', 'users.id', 'comments.user_id')
	.where('camp_id','=',id)
	.orderBy('comment_id')
	.then(data=>{
		 res.json(data)
	})
	.catch(err=>{res.status(400).json('Unable to get comments')})
})

app.delete('/deleteCamp',(req,res)=>{
//a changer dans FE user	
	const {camp_id,user}=req.body;
	//deleting everything from comments to camp
	//using transaction to delete rows in two different table
	if(user===process.env.admin_id){
		db.transaction(trx=>{
		trx.from('comments').innerJoin('camps', 'camps.id', 'comments.camp_id')
		.innerJoin('users', 'users.id', 'comments.user_id')
		.where('camp_id','=',camp_id)
		.del()		
		.returning('camp_id')
		.then(campId=>{

		return trx('camps')
			.returning('*')
			.where('id','=',camp_id)	
			.del()				
		})
		.then(trx.commit)
		.catch(trx.rollback)
	})	
	.catch(err=> res.status(400).json('Cannot delete that camp'))
	}else{
		res.json(`Access refused.`)
	}	
})

//a changer dans FE user	
app.put('/updateCamp',(req, res)=>{
	//updating camp and responding with the new camp
	const { camps_name,loacation,description,image,added,price,id,user } = req.body;
	if(user===process.env.admin_id){
		db('camps').where('id','=',id )
	.update({
	    camps_name: camps_name,
	    loacation: loacation,
	    description: description,
	    image: image,
	    added: added,
	    price: price	    
	  	})
	.returning('*')
	.then(camps=>{
		res.json(camps[0])
	})
	.catch(err=>res.status(400).json('unable to get camp'))
	}else{
		res.json(`Access refused.`)
	}		
})

//a changer dans FE user
app.delete('/deleteComment',(req,res)=>{
//deleting one comment in terms of the id received from the FE
	const {comment_id,user}=req.body;
	if(user===process.env.admin_id){
	db('comments').where('comment_id','=',comment_id)
	.del()
	.returning('*')
	.then(comments=>{
		res.json(comments[0])
	})
	.catch(err=> res.status(400).json('Cannot delete that comment.'))
	}else{
		res.json(`Access refused.`)
	}	
})

app.post('/addItem',(req,res)=>{
	const {shop_item_id,user_id,order_date}=req.body;
	//inserting shop item to the db (table: order_shop) corresponding to the user's id
	if(user_id){
		db('order_shop')
		.returning('*')	
		.insert({
			shop_item_id:shop_item_id,
			user_id:user_id,
			order_date:order_date			
		}).then(data=>{
			res.json(data[0])
		})
		.catch(err=> res.status(400).json('Unable to add that order'))
	}else{
		res.json('You need to be logged to add items.')
	}	
})
	
	//modifier le front end de cette partie
app.delete('/deleteOrder',(req,res)=>{
//deleting order where user's id from the db === user's id from the FE and where
//shop item's id from db === shop item's from the FE	
	const {shop_item_id,user_id,order_date}=req.body;	
	db('order_shop').where('shop_item_id','=',shop_item_id)
	.andWhere('user_id','=',user_id)
	.del()
	.returning('*')
	.then(order=>{
		res.json(order[0])
	})
	.catch(err=> res.status(400).json('Cannot delete that order.'))
})

app.post('/forgot',(req,res)=>{	
	const {email}=req.body;        
	db('users')
	.where('email','=',email)
	//selecting user where email from db === email from received from FE	
	.then(user=>{
		if(user[0]){
		//creating a token and an expire date(number)		
			const token=crypto.randomBytes(20).toString('hex');
			const expires=Number(Date.now())+ 3600000;
			db('login')			
			.where('email','=',email)
			//updating the db with the new token and expire date									
			.update({
				resetpasstoken:token,				
				resetpassexpires:expires			
			})
			.returning(['resetpasstoken'])
			.then(data=>{
				res.json('data sent.')
				//sending mail with nodemailer to the user (with the link+token to reset the password)				
				let transporter = nodemailer.createTransport({
					service: 'yahoo',		        
					auth: {
		            user: 'TestNodemailerYelcamp@yahoo.com', 
		            pass: `${process.env.mail_password}` 
		        }
		    });	
				let mailOptions = {
		        from: 'TestNodemailerYelcamp@yahoo.com', // sender address
		        to: user[0].email, // list of receivers
		        subject: 'Hello', // Subject line
		        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
		        'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
		        'https://yelpcamponheroku.herokuapp.com/ResetPassword/' + data[0].resetpasstoken + '\n\n' +
		        'If you did not request this, please ignore this email and your password will remain unchanged.\n' // plain text body
		      };
		      transporter.sendMail(mailOptions, (error, info) => {
		      	if (error) {
		      		return console.log(error);
		      	}
		      	console.log('Message sent: %s', info.messageId);
		      	console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
		      });
		  })
		}else{
			return res.json('Wrong email !')
		}
	})
	.catch(err=> res.status(400).json('err'))
});

app.get('/resetPass/:token',(req,res)=>{
	const {token}=req.params;
	//getting user's data where the token received from the query string === to the token from db
	db('login')			
	.where('resetpasstoken','=',token)
	.returning(['resetpassexpires','email'])
	.then(data=>{
		if(data[0]){
			//checking if the expire date isnt expired 
			if(Number(data[0].resetpassexpires)>Date.now()){				
				res.json({email:data[0].email})
			}else{
				res.json('Password reset token has expired.')				
			}
		}else{
			res.json('Password reset token is invalid')
		}
	})
	.catch(err=> res.status(400).json('err'))
})

app.put('/updatePassword',(req, res)=>{
	const { resetpasstoken,password } = req.body;
	//updating password and hashing it with bcrypt
	bcrypt.genSalt(10, function(err, salt){
	bcrypt.hash(password, salt, function(err, hash) {
	db('login')
	.where('resetpasstoken','=',resetpasstoken )
	.update({
	    resetpasstoken: null,
	    resetpassexpires: null,
	    password: hash	      
	  	})
	  	.returning('email')	
	.then(email=>{
		res.json({email:email[0]})
	})
	.catch(err=>res.status(400).json('Unable to reset your password.'))
		})
	})	
})


app.get('/moreinfo/:camps_id',(req,res)=>{
	const {camps_id}=req.params;
	db.from('comments').innerJoin('camps', 'camps.id', 'comments.camp_id')
	.innerJoin('users', 'users.id', 'comments.user_id')
	.where('camp_id','=',camps_id)
	.orderBy('comment_id')
	.then(data=>{
		 res.json(data)
	})
	.catch(err=>{res.status(400).json('Unable to get comments')})
})

app.get('/singlecamp/:id',(req,res)=>{
	const {id}=req.params;
	db.select('*').from('camps').where('id','=',id)
		.then(camp=>{
		 res.json(camp[0])
	})
	.catch(err=>{res.status(400).json('Unable to get comments')})
})


app.post('/googleApiK',(req,res)=>{
	const {camp_name}=req.body;
	fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${camp_name}&key=${process.env.google_api_key}`)
    .then(response=>{
      return response.json()      
    })
    .then(data=>{
     res.json(data)         
    })	
})

const appCla = new Clarifai.App({
 apiKey: `${process.env.clarifai_api_key}`
});

app.post('/handleApiCall',(req,res)=>{
	//getting data from clarifai api
	const {input}=req.body;
	appCla.models
    .predict(Clarifai.MODERATION_MODEL,input)
    .then(data => {
      res.json(data);
    })
    .catch(err => res.status(400).json('unable to work with API'))
})


app.listen(process.env.PORT||3001,()=>{console.log(`App running on port ${3001||process.env.PORT}`)});