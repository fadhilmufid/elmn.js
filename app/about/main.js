
async function getHtml() {
  let obj = await fetch('https://jsonplaceholder.typicode.com/posts/3')
   .then(response => response.text())
   console.log(obj)
   return obj
}

let home = await getHtml()
export const variables = {  // Export the variables
    about: home, // Example variable
};

// console.log("Variables loaded:", variables);