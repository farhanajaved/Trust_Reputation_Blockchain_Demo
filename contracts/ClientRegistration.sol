// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
contract ClientRegistration {
   // Event to emit when a user is registered as a client.
   event ClientRegistered(address clientAddress);
   // Mapping to keep track of registered clients.
   mapping(address => bool) public registeredClients;
   // Function to register the sender as a client, allowing multiple registrations.
   function registerAsClient() public {
       // Setting the sender as a registered client each time this function is called.
       registeredClients[msg.sender] = true;
   }
   // Function to emit the registration event manually
   function emitRegistrationEvent() public {
       require(registeredClients[msg.sender], "Sender is not registered as a client.");
       emit ClientRegistered(msg.sender);
   }
}