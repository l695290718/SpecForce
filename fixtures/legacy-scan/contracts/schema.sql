CREATE TABLE customers (
  id UUID PRIMARY KEY
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id)
);
