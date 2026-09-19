List<String> locationNames=new List<String>{'Philippines','Türkiye','Kenya','Indonesia','Somalia','Chile','Bangladesh','Guatemala','Madagascar','Papua New Guinea','Guinea-Bissau','Liberia','Philippines','Nepal','Lao People\'s Democratic Republic (the)','Sierra Leone','Indonesia','Colombia','India','Tajikistan','Kyrgyzstan','Afghanistan','Myanmar','Chad','Bangladesh','Georgia','Central African Republic','Venezuela (Bolivarian Republic of)','Sri Lanka','Armenia','Syrian Arab Republic','Philippines','Democratic Republic of the Congo','United Republic of Tanzania','Kenya','Dominican Republic','Fiji','Guinea-Bissau','Liberia','Micronesia (Federated States of)','Liberia','Solomon Islands','Bangladesh','Yemen','Botswana','Afghanistan','Suriname','Angola','Burkina Faso','Somalia','Ethiopia','Zambia','Mongolia','Brazil','Ecuador','Peru','Cameroon','the Republic of North Macedonia','Rwanda','Malawi','United States','Canada','Mexico','Costa Rica','Panama','Argentina','Bolivia','Uruguay','Paraguay','South Africa','Namibia','Zimbabwe','Mozambique','Uganda','Ghana','Nigeria','Senegal','Morocco','Egypt','Tunisia','Saudi Arabia','United Arab Emirates','Oman','Jordan','Iraq','Iran','Pakistan','Bhutan','Thailand','Vietnam','Cambodia','Malaysia','Singapore','South Korea','Japan','China','Mongolia','Kazakhstan','Uzbekistan','Australia'};

List<Decimal> warehouseLatitudes=new List<Decimal>{14.5995,39.9334,-1.2921,-6.2088,2.0469,-33.4489,23.8103,14.6349,-18.8792,-9.4438,11.8817,6.3156,14.6760,27.7172,17.9757,8.4657,-6.1751,4.7110,28.6139,38.5598,42.8746,34.5553,19.7633,12.1348,22.3569,41.7151,4.3947,10.4806,6.9271,40.1792,33.5138,10.3157,-4.4419,-6.7924,-4.0435,18.4861,-18.1248,11.8640,6.4281,6.9640,7.9465,-9.4280,24.8949,15.3694,-24.6282,31.6139,5.8520,-8.8390,12.3714,9.0765,9.0192,-15.3875,47.8864,-15.7975,-0.1807,-12.0464,3.8480,42.0043,-1.9441,-13.9626,38.9072,45.4215,19.4326,9.9281,8.9824,-34.6037,-16.4897,-34.9011,-25.2637,-33.9249,-22.5609,-17.8252,-25.9692,0.3476,5.6037,9.0765,14.7167,33.5731,30.0444,36.8065,24.7136,24.4539,23.5880,31.9539,33.3152,35.6892,33.6844,27.4728,13.7563,21.0278,11.5564,3.1390,1.3521,37.5665,35.6762,39.9042,47.8864,51.1694,41.2995,-33.8688};

List<Decimal> warehouseLongitudes=new List<Decimal>{120.9842,32.8597,36.8219,106.8456,45.3182,-70.6693,90.4125,-90.5069,47.5079,147.1803,-15.6170,-10.8074,121.0437,85.3240,102.6301,-13.2317,106.8167,-74.0721,77.2090,68.7870,74.6122,69.2075,96.0785,15.0557,91.7832,44.8271,18.5582,-66.9036,79.8612,44.4999,36.2765,123.8854,15.2663,39.2083,39.6682,-69.9312,178.4419,-15.5900,-9.4295,158.1610,-9.3086,159.9550,91.8733,44.1910,25.9231,64.6263,-55.2038,13.2894,-1.5197,44.7860,38.7469,28.3228,106.9057,-47.8825,-78.4678,-77.0428,11.5021,21.4280,30.0619,34.0151,-77.0369,-75.6972,-99.1332,-84.0907,-79.5199,-58.3816,-68.1193,-56.1645,-57.5759,18.4241,17.0832,31.0335,32.5732,32.5825,-0.1870,7.3986,-17.4677,-7.5898,31.2357,10.1815,46.6753,54.3773,58.3829,35.9106,44.3661,51.3890,73.0479,89.6390,100.5018,105.8342,104.9282,101.6869,103.8198,126.9780,139.6503,116.4074,106.9057,71.4491,69.2401,151.2093};

List<String> resourceTypes=new List<String>{'Water','Food','Medicine','Shelter','Generator','Blankets','Tents'};

List<String> organizations=new List<String>{'UNICEF','IFRC','Red Cross','WHO','MSF','AidBridge','ReliefWorks','CareNet','Humanity First','Partners for Good'};

if(locationNames.size()!=100||warehouseLatitudes.size()!=100||warehouseLongitudes.size()!=100){System.debug('ERROR: Expected exactly 100 locations and coordinates.');return;}

List<Warehouse__c> warehouses=new List<Warehouse__c>();

for(Integer i=0;i<100;i++){warehouses.add(new Warehouse__c(Name=locationNames[i]+' Warehouse '+(i+1),Location__c=locationNames[i],Status__c='Operational',Operating_Capacity__c=55+Math.mod((i+1)*7,45),Latitude__c=warehouseLatitudes[i],Longitude__c=warehouseLongitudes[i]));}

insert warehouses;

List<Relief_Resource__c> resources=new List<Relief_Resource__c>();

for(Integer w=0;w<warehouses.size();w++){Integer resourceCount=4+Math.mod(w,4);for(Integer r=0;r<resourceCount;r++){String resourceType=resourceTypes[Math.mod(r+w,resourceTypes.size())];Decimal quantity=(r+1)*3500+(w*220);String organization=organizations[Math.mod(w+r,organizations.size())];resources.add(new Relief_Resource__c(Name=resourceType+' - '+warehouses[w].Name+' - '+(r+1),Resource_Type__c=resourceType,Quantity_Available__c=quantity,Warehouse__c=warehouses[w].Id,Owner_Organization__c=organization,Status__c='Available',Expiration_Date__c=Date.today().addDays(20+(r*12)+Math.mod(w,15))));}}

insert resources;

System.debug('Warehouses created: '+warehouses.size());
System.debug('Relief resources created: '+resources.size());
System.debug('Total warehouses in org: '+[SELECT COUNT() FROM Warehouse__c]);
System.debug('Total relief resources in org: '+[SELECT COUNT() FROM Relief_Resource__c]);